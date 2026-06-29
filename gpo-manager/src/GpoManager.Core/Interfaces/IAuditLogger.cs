namespace GpoManager.Core.Interfaces;

public interface IAuditLogger
{
    void Log(string action, string target, string? details = null);
    Task<IReadOnlyList<string>> ReadRecentAsync(int count = 100, CancellationToken cancellationToken = default);
}
