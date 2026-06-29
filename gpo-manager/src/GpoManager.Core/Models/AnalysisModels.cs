namespace GpoManager.Core.Models;

public sealed class DuplicateReport
{
    public string SettingKey { get; init; } = string.Empty;
    public string SettingName { get; init; } = string.Empty;
    public string? Category { get; init; }
    public GpoSettingScope Scope { get; init; }
    public string Value { get; init; } = string.Empty;
    public IReadOnlyList<GpoSettingOccurrence> Occurrences { get; init; } = [];
}

public sealed class GpoSettingOccurrence
{
    public Guid GpoId { get; init; }
    public string GpoDisplayName { get; init; } = string.Empty;
    public string? Value { get; init; }
}

public sealed class ConflictReport
{
    public string SettingKey { get; init; } = string.Empty;
    public string SettingName { get; init; } = string.Empty;
    public string? Category { get; init; }
    public GpoSettingScope Scope { get; init; }
    public IReadOnlyList<GpoSettingOccurrence> ConflictingValues { get; init; } = [];
}

public sealed class OptimizationSuggestion
{
    public OptimizationType Type { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string? GpoId { get; init; }
    public string? GpoDisplayName { get; init; }
    public OptimizationSeverity Severity { get; init; }
}

public enum OptimizationType
{
    OrphanedGpo,
    EmptyGpo,
    DisabledLink,
    DuplicateSetting,
    ConflictingSetting,
    HighComplexity
}

public enum OptimizationSeverity
{
    Info,
    Warning,
    Critical
}

public sealed class GpoAnalysisResult
{
    public DateTime AnalyzedAt { get; init; }
    public int TotalGpos { get; init; }
    public int OrphanedGpos { get; init; }
    public int EmptyGpos { get; init; }
    public int DuplicateCount { get; init; }
    public int ConflictCount { get; init; }
    public IReadOnlyList<DuplicateReport> Duplicates { get; init; } = [];
    public IReadOnlyList<ConflictReport> Conflicts { get; init; } = [];
    public IReadOnlyList<OptimizationSuggestion> Suggestions { get; init; } = [];
    public IReadOnlyDictionary<Guid, int> ComplexityScores { get; init; } = new Dictionary<Guid, int>();
}

public sealed class DomainConnectionInfo
{
    public string DomainName { get; init; } = string.Empty;
    public string? ForestName { get; init; }
    public string? UserName { get; init; }
    public bool IsConnected { get; init; }
    public string? ErrorMessage { get; init; }
}

public sealed record AdTreeNode
{
    public string DistinguishedName { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public AdNodeType NodeType { get; init; }
    public bool IsInheritanceBlocked { get; init; }
    public IReadOnlyList<GpoLink> LinkedGpos { get; init; } = [];
    public IReadOnlyList<AdTreeNode> Children { get; init; } = [];
}

public enum AdNodeType
{
    Domain,
    OrganizationalUnit,
    Site
}

public sealed class GpoPermissionEntry
{
    public string Trustee { get; init; } = string.Empty;
    public string Permission { get; init; } = string.Empty;
    public bool Inherited { get; init; }
}

public sealed record GpoDetail
{
    public GpoSummary Summary { get; init; } = new();
    public IReadOnlyList<GpoLink> Links { get; init; } = [];
    public IReadOnlyList<GpoSetting> Settings { get; init; } = [];
    public IReadOnlyList<GpoPermissionEntry> Permissions { get; init; } = [];
}

public sealed class CreateGpoRequest
{
    public string DisplayName { get; init; } = string.Empty;
    public string? Description { get; init; }
    public Guid? SourceGpoId { get; init; }
}

public sealed class UpdateRegistrySettingRequest
{
    public Guid GpoId { get; init; }
    public GpoSettingScope Scope { get; init; }
    public string KeyPath { get; init; } = string.Empty;
    public string ValueName { get; init; } = string.Empty;
    public string Value { get; init; } = string.Empty;
    public RegistryValueKind ValueKind { get; init; } = RegistryValueKind.String;
}

public enum RegistryValueKind
{
    String,
    DWord,
    QWord,
    MultiString,
    ExpandString
}
