using System.DirectoryServices;
using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;

namespace GpoManager.Infrastructure.Services;

public sealed class ActiveDirectoryService : IActiveDirectoryService
{
    private readonly IGpoLinkService _linkService;

    public ActiveDirectoryService(IGpoLinkService linkService)
    {
        _linkService = linkService;
    }

    public Task<DomainConnectionInfo> GetConnectionInfoAsync(CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            return Task.FromResult(new DomainConnectionInfo
            {
                IsConnected = false,
                ErrorMessage = "Active Directory nécessite Windows."
            });
        }

        try
        {
            using var rootDse = new DirectoryEntry("LDAP://RootDSE");
            var domainName = rootDse.Properties["defaultNamingContext"]?.Value?.ToString() ?? string.Empty;
            var forestName = rootDse.Properties["rootDomainNamingContext"]?.Value?.ToString();

            return Task.FromResult(new DomainConnectionInfo
            {
                DomainName = ExtractDomainFromDn(domainName),
                ForestName = forestName is not null ? ExtractDomainFromDn(forestName) : null,
                UserName = Environment.UserName,
                IsConnected = !string.IsNullOrEmpty(domainName)
            });
        }
        catch (Exception ex)
        {
            return Task.FromResult(new DomainConnectionInfo
            {
                IsConnected = false,
                ErrorMessage = ex.Message,
                UserName = Environment.UserName
            });
        }
    }

    public Task<DomainConnectionInfo> TestConnectionAsync(CancellationToken cancellationToken = default)
        => GetConnectionInfoAsync(cancellationToken);

    public async Task<AdTreeNode> GetDomainTreeAsync(CancellationToken cancellationToken = default)
    {
        var connection = await GetConnectionInfoAsync(cancellationToken);
        if (!connection.IsConnected)
        {
            throw new InvalidOperationException(connection.ErrorMessage ?? "Connexion AD impossible.");
        }

        using var rootDse = new DirectoryEntry("LDAP://RootDSE");
        var defaultNc = rootDse.Properties["defaultNamingContext"]?.Value?.ToString()
            ?? throw new InvalidOperationException("defaultNamingContext introuvable.");

        var domainNode = await BuildOuTreeAsync(defaultNc, AdNodeType.Domain, cancellationToken);
        var ous = await GetOrganizationalUnitsAsync(cancellationToken);

        return domainNode with { Children = ous };
    }

    public async Task<IReadOnlyList<AdTreeNode>> GetOrganizationalUnitsAsync(CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            return [];
        }

        using var rootDse = new DirectoryEntry("LDAP://RootDSE");
        var defaultNc = rootDse.Properties["defaultNamingContext"]?.Value?.ToString() ?? string.Empty;

        using var searcher = new DirectorySearcher(new DirectoryEntry($"LDAP://{defaultNc}"))
        {
            Filter = "(objectClass=organizationalUnit)",
            SearchScope = SearchScope.Subtree,
            PageSize = 500
        };
        searcher.PropertiesToLoad.AddRange(["distinguishedName", "name", "gPLink"]);

        var nodes = new List<AdTreeNode>();
        foreach (SearchResult result in searcher.FindAll())
        {
            cancellationToken.ThrowIfCancellationRequested();
            var dn = result.Properties["distinguishedName"][0]?.ToString() ?? string.Empty;
            var name = result.Properties["name"][0]?.ToString() ?? ExtractName(dn);
            var links = await _linkService.GetLinksForTargetAsync(dn, cancellationToken);

            nodes.Add(new AdTreeNode
            {
                DistinguishedName = dn,
                Name = name,
                NodeType = AdNodeType.OrganizationalUnit,
                IsInheritanceBlocked = IsInheritanceBlocked(result),
                LinkedGpos = links,
                Children = []
            });
        }

        return BuildHierarchy(nodes, defaultNc);
    }

    private async Task<AdTreeNode> BuildOuTreeAsync(string dn, AdNodeType nodeType, CancellationToken cancellationToken)
    {
        var links = await _linkService.GetLinksForTargetAsync(dn, cancellationToken);
        return new AdTreeNode
        {
            DistinguishedName = dn,
            Name = ExtractName(dn),
            NodeType = nodeType,
            LinkedGpos = links,
            Children = []
        };
    }

    private static List<AdTreeNode> BuildHierarchy(List<AdTreeNode> flatNodes, string domainDn)
    {
        var lookup = flatNodes.ToDictionary(n => n.DistinguishedName, StringComparer.OrdinalIgnoreCase);
        var roots = new List<AdTreeNode>();

        foreach (var node in flatNodes.OrderBy(n => n.DistinguishedName.Count(c => c == ',')))
        {
            var parentDn = GetParentDn(node.DistinguishedName);
            if (parentDn is null || parentDn.Equals(domainDn, StringComparison.OrdinalIgnoreCase))
            {
                roots.Add(node);
                continue;
            }

            if (lookup.TryGetValue(parentDn, out var parent))
            {
                var children = parent.Children.ToList();
                children.Add(node);
                lookup[parentDn] = parent with { Children = children };
            }
            else
            {
                roots.Add(node);
            }
        }

        return roots;
    }

    private static string? GetParentDn(string dn)
    {
        var comma = dn.IndexOf(',');
        return comma < 0 ? null : dn[(comma + 1)..];
    }

    private static bool IsInheritanceBlocked(SearchResult result)
    {
        var gPLink = result.Properties["gPLink"]?[0]?.ToString();
        return gPLink?.Contains(";0", StringComparison.Ordinal) == true;
    }

    private static string ExtractName(string dn)
    {
        var first = dn.Split(',')[0];
        var eq = first.IndexOf('=');
        return eq >= 0 ? first[(eq + 1)..] : first;
    }

    private static string ExtractDomainFromDn(string dn)
    {
        var parts = dn.Split(',')
            .Where(p => p.StartsWith("DC=", StringComparison.OrdinalIgnoreCase))
            .Select(p => p[3..]);
        return string.Join('.', parts);
    }
}
