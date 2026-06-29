using System.Management.Automation;
using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;
using GpoManager.Infrastructure.PowerShell;

namespace GpoManager.Infrastructure.Services;

public sealed class GpoLinkService : IGpoLinkService, IDisposable
{
    private readonly PowerShellExecutor _executor;
    private readonly IAuditLogger _auditLogger;

    public GpoLinkService(IAuditLogger auditLogger)
    {
        _auditLogger = auditLogger;
        _executor = new PowerShellExecutor();
    }

    public async Task<IReadOnlyList<GpoLink>> GetLinksForGpoAsync(Guid gpoId, CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            """
            $gpo = Get-GPO -Guid $GpoId
            Get-GPO -Guid $GpoId | ForEach-Object {
                $_.Links | ForEach-Object {
                    [PSCustomObject]@{
                        GpoId = $gpo.Id
                        DisplayName = $gpo.DisplayName
                        Target = $_.Target
                        Enabled = $_.Enabled
                        Enforced = $_.Enforced
                        Order = $_.Order
                    }
                }
            }
            """,
            new Dictionary<string, object> { ["GpoId"] = gpoId.ToString() },
            cancellationToken);

        return results.Select(MapLink).ToList();
    }

    public async Task<IReadOnlyList<GpoLink>> GetLinksForTargetAsync(string targetDn, CancellationToken cancellationToken = default)
    {
        var results = await _executor.InvokeAsync(
            """
            Get-GPInheritance -Target $Target | Select-Object -ExpandProperty GpoLinks
            """,
            new Dictionary<string, object> { ["Target"] = targetDn },
            cancellationToken);

        return results.Select(MapLink).ToList();
    }

    public async Task<GpoLink> CreateLinkAsync(
        Guid gpoId,
        string targetDn,
        bool enabled = true,
        bool enforced = false,
        int? order = null,
        CancellationToken cancellationToken = default)
    {
        var script = """
            $link = New-GPLink -Guid $GpoId -Target $Target -LinkEnabled:$Enabled -Enforced:$Enforced
            if ($Order) { Set-GPLink -Guid $GpoId -Target $Target -Order $Order }
            $link
            """;

        var parameters = new Dictionary<string, object>
        {
            ["GpoId"] = gpoId.ToString(),
            ["Target"] = targetDn,
            ["Enabled"] = enabled,
            ["Enforced"] = enforced
        };

        if (order.HasValue)
        {
            parameters["Order"] = order.Value;
        }

        var results = await _executor.InvokeAsync(script, parameters, cancellationToken);
        var link = MapLink(results.First());
        _auditLogger.Log("CreateGPLink", targetDn, gpoId.ToString());
        return link;
    }

    public async Task RemoveLinkAsync(Guid gpoId, string targetDn, CancellationToken cancellationToken = default)
    {
        await _executor.InvokeAsync(
            "Remove-GPLink -Guid $GpoId -Target $Target -Confirm:$false",
            new Dictionary<string, object>
            {
                ["GpoId"] = gpoId.ToString(),
                ["Target"] = targetDn
            },
            cancellationToken);

        _auditLogger.Log("RemoveGPLink", targetDn, gpoId.ToString());
    }

    public async Task UpdateLinkAsync(
        Guid gpoId,
        string targetDn,
        bool? enabled = null,
        bool? enforced = null,
        int? order = null,
        CancellationToken cancellationToken = default)
    {
        var parameters = new Dictionary<string, object>
        {
            ["GpoId"] = gpoId.ToString(),
            ["Target"] = targetDn
        };

        if (enabled.HasValue)
        {
            parameters["LinkEnabled"] = enabled.Value;
        }

        if (enforced.HasValue)
        {
            parameters["Enforced"] = enforced.Value;
        }

        if (order.HasValue)
        {
            parameters["Order"] = order.Value;
        }

        await _executor.InvokeAsync("Set-GPLink @PSBoundParameters", parameters, cancellationToken);
        _auditLogger.Log("UpdateGPLink", targetDn, gpoId.ToString());
    }

    private static GpoLink MapLink(PSObject obj)
    {
        var targetDn = obj.Properties["Target"]?.Value?.ToString() ?? string.Empty;
        return new GpoLink
        {
            GpoId = Guid.TryParse(obj.Properties["GpoId"]?.Value?.ToString(), out var id) ? id : Guid.Empty,
            GpoDisplayName = obj.Properties["DisplayName"]?.Value?.ToString() ?? string.Empty,
            TargetDn = targetDn,
            TargetName = ExtractName(targetDn),
            TargetType = targetDn.StartsWith("OU=", StringComparison.OrdinalIgnoreCase)
                ? GpoLinkTargetType.OrganizationalUnit
                : GpoLinkTargetType.Domain,
            IsEnabled = obj.Properties["Enabled"]?.Value is not false,
            IsEnforced = obj.Properties["Enforced"]?.Value is true,
            Order = int.TryParse(obj.Properties["Order"]?.Value?.ToString(), out var order) ? order : 0
        };
    }

    private static string ExtractName(string dn)
    {
        var first = dn.Split(',')[0];
        var eq = first.IndexOf('=');
        return eq >= 0 ? first[(eq + 1)..] : first;
    }

    public void Dispose() => _executor.Dispose();
}
