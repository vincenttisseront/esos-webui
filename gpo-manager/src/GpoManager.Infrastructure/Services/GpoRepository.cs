using System.Management.Automation;
using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;
using GpoManager.Infrastructure.PowerShell;

namespace GpoManager.Infrastructure.Services;

public sealed class GpoRepository : IGpoRepository, IDisposable
{
    private readonly PowerShellExecutor _executor;
    private readonly IAuditLogger _auditLogger;

    public GpoRepository(IAuditLogger auditLogger)
    {
        _auditLogger = auditLogger;
        _executor = new PowerShellExecutor();
    }

    public async Task<IReadOnlyList<GpoSummary>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            "Get-GPO -All | Select-Object Id, DisplayName, Description, CreationTime, ModificationTime, Owner, GpoStatus, WmiFilter",
            cancellationToken: cancellationToken);

        var summaries = new List<GpoSummary>();
        foreach (var result in results)
        {
            var summary = MapGpoSummary(result);
            var links = await GetLinkCountAsync(summary.Id, cancellationToken);
            summaries.Add(summary with { LinkCount = links });
        }

        return summaries;
    }

    public async Task<GpoDetail?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            "Get-GPO -Guid $Guid",
            new Dictionary<string, object> { ["Guid"] = id.ToString() },
            cancellationToken);

        var result = results.FirstOrDefault();
        if (result is null)
        {
            return null;
        }

        var summary = MapGpoSummary(result);
        var linkCount = await GetLinkCountAsync(summary.Id, cancellationToken);
        summary = summary with { LinkCount = linkCount };

        var xml = await ExportXmlReportAsync(id, cancellationToken);
        var settings = Analysis.GpoXmlParser.ParseSettings(xml, id, summary.DisplayName);

        return new GpoDetail
        {
            Summary = summary,
            Links = await GetLinksInternalAsync(id, cancellationToken),
            Settings = settings,
            Permissions = await GetPermissionsAsync(id, cancellationToken)
        };
    }

    public async Task<GpoSummary> CreateAsync(CreateGpoRequest request, CancellationToken cancellationToken = default)
    {
        IReadOnlyList<PSObject> results;

        if (request.SourceGpoId.HasValue)
        {
            results = await _executor.InvokeAsync(
                "Copy-GPO -SourceGpoId $SourceGpoId -TargetName $TargetName",
                new Dictionary<string, object>
                {
                    ["SourceGpoId"] = request.SourceGpoId.Value.ToString(),
                    ["TargetName"] = request.DisplayName
                },
                cancellationToken);
        }
        else
        {
            results = await _executor.InvokeAsync(
                "New-GPO -Name $Name" + (request.Description is not null ? " -Description $Description" : string.Empty),
                new Dictionary<string, object>
                {
                    ["Name"] = request.DisplayName,
                    ["Description"] = request.Description ?? string.Empty
                },
                cancellationToken);
        }

        var summary = MapGpoSummary(results.First());
        _auditLogger.Log("CreateGPO", summary.DisplayName, summary.Id.ToString());
        return summary;
    }

    public async Task<GpoSummary> CopyAsync(Guid sourceId, string newDisplayName, CancellationToken cancellationToken = default)
    {
        return await CreateAsync(new CreateGpoRequest
        {
            DisplayName = newDisplayName,
            SourceGpoId = sourceId
        }, cancellationToken);
    }

    public async Task UpdateMetadataAsync(Guid id, string displayName, string? description, CancellationToken cancellationToken = default)
    {
        await _executor.InvokeAsync(
            "Rename-GPO -Guid $Guid -NewName $NewName; if ($Description) { Set-GPO -Guid $Guid -Description $Description }",
            new Dictionary<string, object>
            {
                ["Guid"] = id.ToString(),
                ["NewName"] = displayName,
                ["Description"] = description ?? string.Empty
            },
            cancellationToken);

        _auditLogger.Log("UpdateGPO", displayName, id.ToString());
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var gpo = await GetByIdAsync(id, cancellationToken);
        await _executor.InvokeAsync(
            "Remove-GPO -Guid $Guid -Confirm:$false",
            new Dictionary<string, object> { ["Guid"] = id.ToString() },
            cancellationToken);

        _auditLogger.Log("DeleteGPO", gpo?.Summary.DisplayName ?? id.ToString(), id.ToString());
    }

    public async Task BackupAsync(Guid id, string backupPath, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(backupPath);
        await _executor.InvokeAsync(
            "Backup-GPO -Guid $Guid -Path $Path",
            new Dictionary<string, object>
            {
                ["Guid"] = id.ToString(),
                ["Path"] = backupPath
            },
            cancellationToken);

        _auditLogger.Log("BackupGPO", id.ToString(), backupPath);
    }

    public async Task<GpoSummary> RestoreAsync(string backupPath, CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            "Restore-GPO -Path $Path -CreateIfNeeded",
            new Dictionary<string, object> { ["Path"] = backupPath },
            cancellationToken);

        var summary = MapGpoSummary(results.First());
        _auditLogger.Log("RestoreGPO", summary.DisplayName, backupPath);
        return summary;
    }

    public async Task<string> ExportXmlReportAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            "Get-GPOReport -Guid $Guid -ReportType Xml",
            new Dictionary<string, object> { ["Guid"] = id.ToString() },
            cancellationToken);

        return results.FirstOrDefault()?.ToString() ?? string.Empty;
    }

    public async Task<IReadOnlyList<GpoPermissionEntry>> GetPermissionsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            "Get-GPPermission -Guid $Guid -All | Select-Object -ExpandProperty PermissionEntries",
            new Dictionary<string, object> { ["Guid"] = id.ToString() },
            cancellationToken);

        return results.Select(r => new GpoPermissionEntry
        {
            Trustee = r.Properties["Trustee"]?.Value?.ToString() ?? string.Empty,
            Permission = r.Properties["Permission"]?.Value?.ToString() ?? string.Empty,
            Inherited = r.Properties["Inherited"]?.Value is true
        }).ToList();
    }

    private async Task<int> GetLinkCountAsync(Guid gpoId, CancellationToken cancellationToken)
    {
        var links = await GetLinksInternalAsync(gpoId, cancellationToken);
        return links.Count;
    }

    private async Task<IReadOnlyList<GpoLink>> GetLinksInternalAsync(Guid gpoId, CancellationToken cancellationToken)
    {
        var results = await _executor.InvokeAsync(
            """
            $gpo = Get-GPO -Guid $Guid
            $gpo | Get-GPOReport -ReportType Html | Out-Null
            Get-GPO -Guid $Guid | Select-Object -ExpandProperty Links
            """,
            new Dictionary<string, object> { ["Guid"] = gpoId.ToString() },
            cancellationToken);

        if (results.Count == 0)
        {
            results = await _executor.InvokeAsync(
                """
                Import-Module GroupPolicy
                $gpo = Get-GPO -Guid $Guid
                if ($gpo.Links) { $gpo.Links } else { @() }
                """,
                new Dictionary<string, object> { ["Guid"] = gpoId.ToString() },
                cancellationToken);
        }

        return results.Select(MapGpoLink).ToList();
    }

    private static GpoSummary MapGpoSummary(PSObject obj)
    {
        var status = obj.Properties["GpoStatus"]?.Value?.ToString() ?? "AllSettingsEnabled";
        return new GpoSummary
        {
            Id = Guid.Parse(obj.Properties["Id"]?.Value?.ToString() ?? Guid.Empty.ToString()),
            DisplayName = obj.Properties["DisplayName"]?.Value?.ToString() ?? string.Empty,
            Description = obj.Properties["Description"]?.Value?.ToString(),
            CreationTime = ParseDate(obj.Properties["CreationTime"]?.Value),
            ModificationTime = ParseDate(obj.Properties["ModificationTime"]?.Value),
            Owner = obj.Properties["Owner"]?.Value?.ToString(),
            DomainName = obj.Properties["DomainName"]?.Value?.ToString(),
            IsUserEnabled = !status.Contains("User", StringComparison.OrdinalIgnoreCase) || status.Contains("Enabled", StringComparison.OrdinalIgnoreCase),
            IsComputerEnabled = !status.Contains("Computer", StringComparison.OrdinalIgnoreCase) || status.Contains("Enabled", StringComparison.OrdinalIgnoreCase)
        };
    }

    private static GpoLink MapGpoLink(PSObject obj)
    {
        var targetDn = obj.Properties["Target"]?.Value?.ToString()
            ?? obj.Properties["Path"]?.Value?.ToString()
            ?? string.Empty;

        return new GpoLink
        {
            GpoId = Guid.TryParse(obj.Properties["GpoId"]?.Value?.ToString(), out var id) ? id : Guid.Empty,
            GpoDisplayName = obj.Properties["DisplayName"]?.Value?.ToString() ?? string.Empty,
            TargetDn = targetDn,
            TargetName = ExtractNameFromDn(targetDn),
            TargetType = InferTargetType(targetDn),
            IsEnabled = obj.Properties["Enabled"]?.Value is not false,
            IsEnforced = obj.Properties["Enforced"]?.Value is true,
            Order = int.TryParse(obj.Properties["Order"]?.Value?.ToString(), out var order) ? order : 0
        };
    }

    private static DateTime ParseDate(object? value)
    {
        if (value is DateTime dt)
        {
            return dt;
        }

        return DateTime.TryParse(value?.ToString(), out var parsed) ? parsed : DateTime.MinValue;
    }

    private static string ExtractNameFromDn(string dn)
    {
        if (string.IsNullOrWhiteSpace(dn))
        {
            return string.Empty;
        }

        var first = dn.Split(',')[0];
        var eq = first.IndexOf('=');
        return eq >= 0 ? first[(eq + 1)..] : first;
    }

    private static GpoLinkTargetType InferTargetType(string dn)
    {
        if (dn.StartsWith("OU=", StringComparison.OrdinalIgnoreCase))
        {
            return GpoLinkTargetType.OrganizationalUnit;
        }

        if (dn.StartsWith("CN=", StringComparison.OrdinalIgnoreCase) && dn.Contains("DC=", StringComparison.OrdinalIgnoreCase))
        {
            return GpoLinkTargetType.Domain;
        }

        return GpoLinkTargetType.Site;
    }

    public void Dispose() => _executor.Dispose();
}
