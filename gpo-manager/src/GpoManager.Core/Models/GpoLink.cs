namespace GpoManager.Core.Models;

public sealed class GpoLink
{
    public Guid GpoId { get; init; }
    public string GpoDisplayName { get; init; } = string.Empty;
    public string TargetDn { get; init; } = string.Empty;
    public string TargetName { get; init; } = string.Empty;
    public GpoLinkTargetType TargetType { get; init; }
    public bool IsEnabled { get; init; } = true;
    public bool IsEnforced { get; init; }
    public int Order { get; init; }
}

public enum GpoLinkTargetType
{
    OrganizationalUnit,
    Domain,
    Site
}
