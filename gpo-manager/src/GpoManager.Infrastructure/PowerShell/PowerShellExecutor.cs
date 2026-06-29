using System.Collections;
using System.Management.Automation;
using System.Management.Automation.Runspaces;

namespace GpoManager.Infrastructure.PowerShell;

internal sealed class PowerShellExecutor : IDisposable
{
    private readonly Runspace _runspace;
    private bool _disposed;

    public PowerShellExecutor()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "La gestion GPO nécessite Windows avec RSAT (module GroupPolicy) installé.");
        }

        var initialSessionState = InitialSessionState.CreateDefault();
        initialSessionState.ImportPSModule(new[] { "GroupPolicy", "ActiveDirectory" });
        _runspace = RunspaceFactory.CreateRunspace(initialSessionState);
        _runspace.Open();
    }

    public async Task<IReadOnlyList<PSObject>> InvokeAsync(
        string script,
        IDictionary<string, object>? parameters = null,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        cancellationToken.ThrowIfCancellationRequested();

        return await Task.Run(() =>
        {
            using var powerShell = System.Management.Automation.PowerShell.Create();
            powerShell.Runspace = _runspace;
            powerShell.AddScript(script);

            if (parameters is not null)
            {
                foreach (var parameter in parameters)
                {
                    powerShell.AddParameter(parameter.Key, parameter.Value);
                }
            }

            var results = powerShell.Invoke();

            if (powerShell.HadErrors)
            {
                var errors = string.Join(Environment.NewLine,
                    powerShell.Streams.Error.Select(e => e.ToString()));
                throw new InvalidOperationException($"Erreur PowerShell : {errors}");
            }

            return (IReadOnlyList<PSObject>)results;
        }, cancellationToken);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _runspace.Close();
        _runspace.Dispose();
        _disposed = true;
    }
}
