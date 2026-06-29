using GpoManager.Core.Models;

namespace GpoManager.Core.Interfaces;

public interface IGpoAnalyzer
{
    Task<GpoAnalysisResult> AnalyzeAsync(
        IReadOnlyList<GpoSummary> gpos,
        Func<Guid, CancellationToken, Task<string>> xmlReportProvider,
        CancellationToken cancellationToken = default);
}
