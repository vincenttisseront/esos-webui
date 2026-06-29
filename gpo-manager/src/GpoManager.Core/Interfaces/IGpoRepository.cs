using GpoManager.Core.Models;

namespace GpoManager.Core.Interfaces;

public interface IGpoRepository
{
    Task<IReadOnlyList<GpoSummary>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<GpoDetail?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<GpoSummary> CreateAsync(CreateGpoRequest request, CancellationToken cancellationToken = default);
    Task<GpoSummary> CopyAsync(Guid sourceId, string newDisplayName, CancellationToken cancellationToken = default);
    Task UpdateMetadataAsync(Guid id, string displayName, string? description, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task BackupAsync(Guid id, string backupPath, CancellationToken cancellationToken = default);
    Task<GpoSummary> RestoreAsync(string backupPath, CancellationToken cancellationToken = default);
    Task<string> ExportXmlReportAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<GpoPermissionEntry>> GetPermissionsAsync(Guid id, CancellationToken cancellationToken = default);
}
