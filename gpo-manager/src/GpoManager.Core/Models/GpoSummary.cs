namespace GpoManager.Core.Models;

public sealed record GpoSummary
{
    public Guid Id { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DateTime CreationTime { get; init; }
    public DateTime ModificationTime { get; init; }
    public string? Owner { get; init; }
    public string? DomainName { get; init; }
    public int LinkCount { get; init; }
    public bool IsUserEnabled { get; init; } = true;
    public bool IsComputerEnabled { get; init; } = true;
    public bool IsOrphaned => LinkCount == 0;
}
