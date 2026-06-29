using GpoManager.Analysis;
using GpoManager.Core.Models;

namespace GpoManager.Analysis.Tests;

public class GpoXmlParserTests
{
    [Fact]
    public void ParseSettings_ExtractsComputerAndUserPolicies()
    {
        var xml = File.ReadAllText("Fixtures/sample-gpo.xml");
        var settings = GpoXmlParser.ParseSettings(xml, Guid.NewGuid(), "Test GPO");

        Assert.Equal(2, settings.Count);
        Assert.Contains(settings, s => s.Name == "DisableTaskMgr" && s.Scope == GpoSettingScope.Computer);
        Assert.Contains(settings, s => s.Name == "HideClock" && s.Scope == GpoSettingScope.User);
    }

    [Fact]
    public void ParseSettings_ReturnsEmptyForInvalidXml()
    {
        var settings = GpoXmlParser.ParseSettings("not xml", Guid.NewGuid(), "Bad");
        Assert.Empty(settings);
    }
}

public class GpoAnalyzerTests
{
    [Fact]
    public async Task AnalyzeAsync_DetectsDuplicates()
    {
        var gpo1 = new GpoSummary { Id = Guid.NewGuid(), DisplayName = "GPO A", LinkCount = 1 };
        var gpo2 = new GpoSummary { Id = Guid.NewGuid(), DisplayName = "GPO B", LinkCount = 1 };
        var duplicateXml = await File.ReadAllTextAsync("Fixtures/duplicate-gpo.xml");

        var analyzer = new GpoAnalyzer();
        var result = await analyzer.AnalyzeAsync(
            [gpo1, gpo2],
            (id, _) => Task.FromResult(duplicateXml));

        Assert.Single(result.Duplicates);
        Assert.Equal("DisableTaskMgr", result.Duplicates[0].SettingName);
        Assert.Empty(result.Conflicts);
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsConflicts()
    {
        var gpo1 = new GpoSummary { Id = Guid.NewGuid(), DisplayName = "GPO A", LinkCount = 1 };
        var gpo2 = new GpoSummary { Id = Guid.NewGuid(), DisplayName = "GPO B", LinkCount = 1 };
        var duplicateXml = await File.ReadAllTextAsync("Fixtures/duplicate-gpo.xml");
        var conflictXml = await File.ReadAllTextAsync("Fixtures/conflict-gpo.xml");

        var analyzer = new GpoAnalyzer();
        var result = await analyzer.AnalyzeAsync(
            [gpo1, gpo2],
            (id, _) => Task.FromResult(id == gpo1.Id ? duplicateXml : conflictXml));

        Assert.Empty(result.Duplicates);
        Assert.Single(result.Conflicts);
        Assert.Equal("DisableTaskMgr", result.Conflicts[0].SettingName);
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsOrphanedGpos()
    {
        var orphaned = new GpoSummary { Id = Guid.NewGuid(), DisplayName = "Orphan", LinkCount = 0 };
        var analyzer = new GpoAnalyzer();
        var result = await analyzer.AnalyzeAsync([orphaned], (_, _) => Task.FromResult(string.Empty));

        Assert.Equal(1, result.OrphanedGpos);
        Assert.Contains(result.Suggestions, s => s.Type == OptimizationType.OrphanedGpo);
    }
}

public class ReportExporterTests
{
    [Fact]
    public async Task ExportCsv_CreatesFile()
    {
        var result = new GpoAnalysisResult
        {
            AnalyzedAt = DateTime.UtcNow,
            Suggestions =
            [
                new OptimizationSuggestion
                {
                    Type = OptimizationType.OrphanedGpo,
                    Title = "Test",
                    Description = "Desc",
                    Severity = OptimizationSeverity.Warning
                }
            ]
        };

        var path = Path.Combine(Path.GetTempPath(), $"gpo-test-{Guid.NewGuid()}.csv");
        var exporter = new ReportExporter();
        await exporter.ExportCsvAsync(result, path);

        Assert.True(File.Exists(path));
        var content = await File.ReadAllTextAsync(path);
        Assert.Contains("OrphanedGpo", content);
        File.Delete(path);
    }

    [Fact]
    public async Task ExportHtml_CreatesFile()
    {
        var result = new GpoAnalysisResult { AnalyzedAt = DateTime.UtcNow, TotalGpos = 5 };
        var path = Path.Combine(Path.GetTempPath(), $"gpo-test-{Guid.NewGuid()}.html");
        var exporter = new ReportExporter();
        await exporter.ExportHtmlAsync(result, path);

        Assert.True(File.Exists(path));
        var content = await File.ReadAllTextAsync(path);
        Assert.Contains("Rapport d'analyse GPO", content);
        File.Delete(path);
    }
}
