using GpoManager.Core.Models;

namespace GpoManager.Core.Interfaces;

public interface IActiveDirectoryService
{
    Task<DomainConnectionInfo> GetConnectionInfoAsync(CancellationToken cancellationToken = default);
    Task<DomainConnectionInfo> TestConnectionAsync(CancellationToken cancellationToken = default);
    Task<AdTreeNode> GetDomainTreeAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AdTreeNode>> GetOrganizationalUnitsAsync(CancellationToken cancellationToken = default);
}
