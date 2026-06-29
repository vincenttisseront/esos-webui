using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;
using GpoManager.Infrastructure.PowerShell;

namespace GpoManager.Infrastructure.Services;

public sealed class GpoEditor : IGpoEditor, IDisposable
{
    private readonly PowerShellExecutor _executor;
    private readonly IGpoRepository _repository;
    private readonly IAuditLogger _auditLogger;

    public GpoEditor(IGpoRepository repository, IAuditLogger auditLogger)
    {
        _repository = repository;
        _auditLogger = auditLogger;
        _executor = new PowerShellExecutor();
    }

    public async Task<IReadOnlyList<GpoSetting>> GetSettingsAsync(Guid gpoId, CancellationToken cancellationToken = default)
    {
        var detail = await _repository.GetByIdAsync(gpoId, cancellationToken);
        return detail?.Settings ?? [];
    }

    public async Task<IReadOnlyList<GpoSetting>> SearchSettingsAsync(string query, CancellationToken cancellationToken = default)
    {
        var gpos = await _repository.GetAllAsync(cancellationToken);
        var results = new List<GpoSetting>();

        foreach (var gpo in gpos)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var settings = await GetSettingsAsync(gpo.Id, cancellationToken);
            results.AddRange(settings.Where(s =>
                s.Name.Contains(query, StringComparison.OrdinalIgnoreCase)
                || (s.Path?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false)
                || (s.Value?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false)
                || s.Category.Contains(query, StringComparison.OrdinalIgnoreCase)));
        }

        return results;
    }

    public async Task UpdateRegistrySettingAsync(UpdateRegistrySettingRequest request, CancellationToken cancellationToken = default)
    {
        var hive = request.Scope == GpoSettingScope.Computer ? "HKLM" : "HKCU";
        var key = request.KeyPath.StartsWith("HK", StringComparison.OrdinalIgnoreCase)
            ? request.KeyPath
            : $"{hive}\\{request.KeyPath.TrimStart('\\')}";

        var type = request.ValueKind switch
        {
            RegistryValueKind.DWord => "DWord",
            RegistryValueKind.QWord => "QWord",
            RegistryValueKind.MultiString => "MultiString",
            RegistryValueKind.ExpandString => "ExpandString",
            _ => "String"
        };

        await _executor.InvokeAsync(
            """
            $gpo = Get-GPO -Guid $GpoId
            Set-GPRegistryValue -Name $Gpo.DisplayName -Key $Key -ValueName $ValueName -Type $Type -Value $Value
            """,
            new Dictionary<string, object>
            {
                ["GpoId"] = request.GpoId.ToString(),
                ["Key"] = key,
                ["ValueName"] = request.ValueName,
                ["Type"] = type,
                ["Value"] = request.Value
            },
            cancellationToken);

        _auditLogger.Log("UpdateRegistrySetting", request.GpoId.ToString(),
            $"{key}\\{request.ValueName}={request.Value}");
    }

    public void Dispose() => _executor.Dispose();
}
