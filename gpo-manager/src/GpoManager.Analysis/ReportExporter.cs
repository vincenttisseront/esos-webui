using System.Globalization;
using System.Text;
using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;

namespace GpoManager.Analysis;

public sealed class ReportExporter : IReportExporter
{
    public Task ExportCsvAsync(GpoAnalysisResult result, string filePath, CancellationToken cancellationToken = default)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Type,Setting,Scope,GPO,Value,Severity");

        foreach (var duplicate in result.Duplicates)
        {
            foreach (var occurrence in duplicate.Occurrences)
            {
                sb.AppendLine(string.Join(",",
                    "Duplicate",
                    CsvEscape(duplicate.SettingName),
                    duplicate.Scope,
                    CsvEscape(occurrence.GpoDisplayName),
                    CsvEscape(occurrence.Value ?? duplicate.Value),
                    "Info"));
            }
        }

        foreach (var conflict in result.Conflicts)
        {
            foreach (var occurrence in conflict.ConflictingValues)
            {
                sb.AppendLine(string.Join(",",
                    "Conflict",
                    CsvEscape(conflict.SettingName),
                    conflict.Scope,
                    CsvEscape(occurrence.GpoDisplayName),
                    CsvEscape(occurrence.Value ?? string.Empty),
                    "Critical"));
            }
        }

        foreach (var suggestion in result.Suggestions)
        {
            sb.AppendLine(string.Join(",",
                suggestion.Type,
                CsvEscape(suggestion.Title),
                string.Empty,
                CsvEscape(suggestion.GpoDisplayName ?? string.Empty),
                CsvEscape(suggestion.Description),
                suggestion.Severity));
        }

        File.WriteAllText(filePath, sb.ToString(), Encoding.UTF8);
        return Task.CompletedTask;
    }

    public Task ExportHtmlAsync(GpoAnalysisResult result, string filePath, CancellationToken cancellationToken = default)
    {
        var html = $$"""
            <!DOCTYPE html>
            <html lang="fr">
            <head>
              <meta charset="utf-8"/>
              <title>Rapport d'analyse GPO — {{result.AnalyzedAt:u}}</title>
              <style>
                body { font-family: Segoe UI, sans-serif; margin: 2rem; color: #1a1a1a; }
                h1, h2 { color: #0f3d7a; }
                .kpi { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
                .kpi div { background: #f3f6fb; border-radius: 8px; padding: 1rem 1.5rem; min-width: 140px; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
                th, td { border: 1px solid #d9e2ef; padding: 0.6rem; text-align: left; }
                th { background: #e8eef7; }
                .critical { color: #b42318; font-weight: 600; }
                .warning { color: #b54708; }
              </style>
            </head>
            <body>
              <h1>Rapport d'analyse GPO</h1>
              <p>Généré le {{result.AnalyzedAt.ToString("f", CultureInfo.GetCultureInfo("fr-FR"))}} UTC</p>
              <div class="kpi">
                <div><strong>{{result.TotalGpos}}</strong><br/>GPO total</div>
                <div><strong>{{result.OrphanedGpos}}</strong><br/>Orphelins</div>
                <div><strong>{{result.EmptyGpos}}</strong><br/>Vides</div>
                <div><strong>{{result.DuplicateCount}}</strong><br/>Duplications</div>
                <div><strong>{{result.ConflictCount}}</strong><br/>Conflits</div>
              </div>
              <h2>Duplications</h2>
              {{BuildDuplicateTable(result)}}
              <h2>Conflits</h2>
              {{BuildConflictTable(result)}}
              <h2>Recommandations</h2>
              {{BuildSuggestionTable(result)}}
            </body>
            </html>
            """;

        File.WriteAllText(filePath, html, Encoding.UTF8);
        return Task.CompletedTask;
    }

    private static string BuildDuplicateTable(GpoAnalysisResult result)
    {
        if (result.Duplicates.Count == 0)
        {
            return "<p>Aucune duplication détectée.</p>";
        }

        var rows = result.Duplicates.SelectMany(d =>
            d.Occurrences.Select(o =>
                $"<tr><td>{HtmlEncode(d.SettingName)}</td><td>{d.Scope}</td><td>{HtmlEncode(o.GpoDisplayName)}</td><td>{HtmlEncode(o.Value ?? d.Value)}</td></tr>"));

        return $"<table><thead><tr><th>Paramètre</th><th>Portée</th><th>GPO</th><th>Valeur</th></tr></thead><tbody>{string.Join(string.Empty, rows)}</tbody></table>";
    }

    private static string BuildConflictTable(GpoAnalysisResult result)
    {
        if (result.Conflicts.Count == 0)
        {
            return "<p>Aucun conflit détecté.</p>";
        }

        var rows = result.Conflicts.SelectMany(c =>
            c.ConflictingValues.Select(o =>
                $"<tr class=\"critical\"><td>{HtmlEncode(c.SettingName)}</td><td>{c.Scope}</td><td>{HtmlEncode(o.GpoDisplayName)}</td><td>{HtmlEncode(o.Value ?? string.Empty)}</td></tr>"));

        return $"<table><thead><tr><th>Paramètre</th><th>Portée</th><th>GPO</th><th>Valeur</th></tr></thead><tbody>{string.Join(string.Empty, rows)}</tbody></table>";
    }

    private static string BuildSuggestionTable(GpoAnalysisResult result)
    {
        if (result.Suggestions.Count == 0)
        {
            return "<p>Aucune recommandation.</p>";
        }

        var rows = result.Suggestions.Select(s =>
            $"<tr class=\"{s.Severity.ToString().ToLowerInvariant()}\"><td>{s.Type}</td><td>{HtmlEncode(s.Title)}</td><td>{HtmlEncode(s.Description)}</td><td>{s.Severity}</td></tr>");

        return $"<table><thead><tr><th>Type</th><th>Titre</th><th>Description</th><th>Sévérité</th></tr></thead><tbody>{string.Join(string.Empty, rows)}</tbody></table>";
    }

    private static string CsvEscape(string value)
    {
        if (value.Contains('"') || value.Contains(',') || value.Contains('\n'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }

        return value;
    }

    private static string HtmlEncode(string value) =>
        System.Net.WebUtility.HtmlEncode(value);
}
