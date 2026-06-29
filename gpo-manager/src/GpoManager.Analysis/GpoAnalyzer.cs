using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;

namespace GpoManager.Analysis;

public sealed class GpoAnalyzer : IGpoAnalyzer
{
    public async Task<GpoAnalysisResult> AnalyzeAsync(
        IReadOnlyList<GpoSummary> gpos,
        Func<Guid, CancellationToken, Task<string>> xmlReportProvider,
        CancellationToken cancellationToken = default)
    {
        var allSettings = new List<GpoSetting>();
        var complexityScores = new Dictionary<Guid, int>();
        var emptyGpoIds = new HashSet<Guid>();

        foreach (var gpo in gpos)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var xml = await xmlReportProvider(gpo.Id, cancellationToken);
            var settings = GpoXmlParser.ParseSettings(xml, gpo.Id, gpo.DisplayName);
            allSettings.AddRange(settings);
            complexityScores[gpo.Id] = settings.Count;

            if (settings.Count == 0)
            {
                emptyGpoIds.Add(gpo.Id);
            }
        }

        var grouped = allSettings
            .GroupBy(s => s.NormalizedKey)
            .Where(g => g.Count() > 1)
            .ToList();

        var duplicates = new List<DuplicateReport>();
        var conflicts = new List<ConflictReport>();

        foreach (var group in grouped)
        {
            var occurrences = group
                .GroupBy(s => s.GpoId)
                .Select(g => new GpoSettingOccurrence
                {
                    GpoId = Guid.Parse(g.Key),
                    GpoDisplayName = g.First().GpoDisplayName,
                    Value = g.First().Value
                })
                .ToList();

            var distinctValues = occurrences
                .Select(o => o.Value ?? string.Empty)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var first = group.First();
            if (distinctValues.Count <= 1)
            {
                duplicates.Add(new DuplicateReport
                {
                    SettingKey = group.Key,
                    SettingName = first.Name,
                    Category = first.Category,
                    Scope = first.Scope,
                    Value = distinctValues.FirstOrDefault() ?? string.Empty,
                    Occurrences = occurrences
                });
            }
            else
            {
                conflicts.Add(new ConflictReport
                {
                    SettingKey = group.Key,
                    SettingName = first.Name,
                    Category = first.Category,
                    Scope = first.Scope,
                    ConflictingValues = occurrences
                });
            }
        }

        var suggestions = BuildSuggestions(gpos, emptyGpoIds, duplicates, conflicts, complexityScores);

        return new GpoAnalysisResult
        {
            AnalyzedAt = DateTime.UtcNow,
            TotalGpos = gpos.Count,
            OrphanedGpos = gpos.Count(g => g.IsOrphaned),
            EmptyGpos = emptyGpoIds.Count,
            DuplicateCount = duplicates.Count,
            ConflictCount = conflicts.Count,
            Duplicates = duplicates,
            Conflicts = conflicts,
            Suggestions = suggestions,
            ComplexityScores = complexityScores
        };
    }

    private static List<OptimizationSuggestion> BuildSuggestions(
        IReadOnlyList<GpoSummary> gpos,
        HashSet<Guid> emptyGpoIds,
        IReadOnlyList<DuplicateReport> duplicates,
        IReadOnlyList<ConflictReport> conflicts,
        IReadOnlyDictionary<Guid, int> complexityScores)
    {
        var suggestions = new List<OptimizationSuggestion>();

        foreach (var gpo in gpos.Where(g => g.IsOrphaned))
        {
            suggestions.Add(new OptimizationSuggestion
            {
                Type = OptimizationType.OrphanedGpo,
                Title = $"GPO orphelin : {gpo.DisplayName}",
                Description = "Ce GPO n'est lié à aucune OU, domaine ou site.",
                GpoId = gpo.Id.ToString(),
                GpoDisplayName = gpo.DisplayName,
                Severity = OptimizationSeverity.Warning
            });
        }

        foreach (var gpoId in emptyGpoIds)
        {
            var gpo = gpos.First(g => g.Id == gpoId);
            suggestions.Add(new OptimizationSuggestion
            {
                Type = OptimizationType.EmptyGpo,
                Title = $"GPO vide : {gpo.DisplayName}",
                Description = "Ce GPO ne contient aucun paramètre configuré.",
                GpoId = gpo.Id.ToString(),
                GpoDisplayName = gpo.DisplayName,
                Severity = OptimizationSeverity.Info
            });
        }

        foreach (var duplicate in duplicates.Take(50))
        {
            suggestions.Add(new OptimizationSuggestion
            {
                Type = OptimizationType.DuplicateSetting,
                Title = $"Paramètre dupliqué : {duplicate.SettingName}",
                Description = $"Configuré dans {duplicate.Occurrences.Count} GPO avec la même valeur.",
                Severity = OptimizationSeverity.Info
            });
        }

        foreach (var conflict in conflicts)
        {
            suggestions.Add(new OptimizationSuggestion
            {
                Type = OptimizationType.ConflictingSetting,
                Title = $"Conflit : {conflict.SettingName}",
                Description = $"Valeurs différentes dans {conflict.ConflictingValues.Count} GPO.",
                Severity = OptimizationSeverity.Critical
            });
        }

        foreach (var (gpoId, score) in complexityScores.Where(kv => kv.Value > 100))
        {
            var gpo = gpos.First(g => g.Id == gpoId);
            suggestions.Add(new OptimizationSuggestion
            {
                Type = OptimizationType.HighComplexity,
                Title = $"GPO complexe : {gpo.DisplayName}",
                Description = $"Contient {score} paramètres — envisagez une segmentation.",
                GpoId = gpo.Id.ToString(),
                GpoDisplayName = gpo.DisplayName,
                Severity = OptimizationSeverity.Warning
            });
        }

        return suggestions;
    }
}
