using GpoManager.Core.Models;

namespace GpoManager.Core.Interfaces;

public interface IGpoLinkService
{
    Task<IReadOnlyList<GpoLink>> GetLinksForGpoAsync(Guid gpoId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<GpoLink>> GetLinksForTargetAsync(string targetDn, CancellationToken cancellationToken = default);
    Task<GpoLink> CreateLinkAsync(Guid gpoId, string targetDn, bool enabled = true, bool enforced = false, int? order = null, CancellationToken cancellationToken = default);
    Task RemoveLinkAsync(Guid gpoId, string targetDn, CancellationToken cancellationToken = default);
    Task UpdateLinkAsync(Guid gpoId, string targetDn, bool? enabled = null, bool? enforced = null, int? order = null, CancellationToken cancellationToken = default);
}
