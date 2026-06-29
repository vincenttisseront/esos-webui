namespace GpoManager.Core.Models;

public sealed class GpoSetting
{
    public string GpoId { get; init; } = string.Empty;
    public string GpoDisplayName { get; init; } = string.Empty;
    public GpoSettingScope Scope { get; init; }
    public string Extension { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Path { get; init; }
    public string? Value { get; init; }
    public string NormalizedKey => $"{Scope}:{Extension}:{Path}:{Name}";
}

public enum GpoSettingScope
{
    Computer,
    User
}
