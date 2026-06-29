using GpoManager.Core.Models;

namespace GpoManager.Core.Interfaces;

public interface IGpoEditor
{
    Task<IReadOnlyList<GpoSetting>> GetSettingsAsync(Guid gpoId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<GpoSetting>> SearchSettingsAsync(string query, CancellationToken cancellationToken = default);
    Task UpdateRegistrySettingAsync(UpdateRegistrySettingRequest request, CancellationToken cancellationToken = default);
}
