using GpoManager.Core.Models;

namespace GpoManager.Core.Interfaces;

public interface IReportExporter
{
    Task ExportCsvAsync(GpoAnalysisResult result, string filePath, CancellationToken cancellationToken = default);
    Task ExportHtmlAsync(GpoAnalysisResult result, string filePath, CancellationToken cancellationToken = default);
}
