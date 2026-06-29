using GpoManager.Core.Interfaces;

namespace GpoManager.Infrastructure.Services;

public sealed class FileAuditLogger : IAuditLogger
{
    private readonly string _logPath;
    private readonly object _lock = new();

    public FileAuditLogger()
    {
        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "GpoManager");
        Directory.CreateDirectory(directory);
        _logPath = Path.Combine(directory, "audit.log");
    }

    public void Log(string action, string target, string? details = null)
    {
        var line = $"{DateTime.UtcNow:O}\t{Environment.UserName}\t{action}\t{target}\t{details ?? string.Empty}";
        lock (_lock)
        {
            File.AppendAllText(_logPath, line + Environment.NewLine);
        }
    }

    public Task<IReadOnlyList<string>> ReadRecentAsync(int count = 100, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_logPath))
        {
            return Task.FromResult<IReadOnlyList<string>>([]);
        }

        var lines = File.ReadAllLines(_logPath)
            .Reverse()
            .Take(count)
            .Reverse()
            .ToList();

        return Task.FromResult<IReadOnlyList<string>>(lines);
    }
}
