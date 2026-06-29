using System.Xml.Linq;
using GpoManager.Core.Models;

namespace GpoManager.Analysis;

public static class GpoXmlParser
{
    private static readonly XNamespace Ns = "http://www.microsoft.com/GroupPolicy/Settings";

    public static IReadOnlyList<GpoSetting> ParseSettings(string xml, Guid gpoId, string gpoDisplayName)
    {
        if (string.IsNullOrWhiteSpace(xml))
        {
            return [];
        }

        XDocument document;
        try
        {
            document = XDocument.Parse(xml);
        }
        catch
        {
            return [];
        }

        var settings = new List<GpoSetting>();
        var root = document.Root;
        if (root is null)
        {
            return settings;
        }

        foreach (var scopeElement in root.Elements())
        {
            var scopeName = scopeElement.Name.LocalName;
            if (!TryParseScope(scopeName, out var scope))
            {
                continue;
            }

            foreach (var extensionData in scopeElement.Descendants().Where(e => e.Name.LocalName == "ExtensionData"))
            {
                var extensionName = extensionData
                    .Descendants()
                    .FirstOrDefault(e => e.Name.LocalName == "Name")
                    ?.Value ?? "Unknown";

                foreach (var policy in extensionData.Descendants().Where(e => e.Name.LocalName is "Policy" or "RegistrySetting" or "SecuritySetting"))
                {
                    var name = GetElementValue(policy, "Name") ?? policy.Attribute("Name")?.Value ?? "Unnamed";
                    var category = GetElementValue(policy, "Category") ?? GetElementValue(policy, "GPOCategory");
                    var path = GetElementValue(policy, "KeyPath")
                        ?? GetElementValue(policy, "Key")
                        ?? GetElementValue(policy, "Path");
                    var value = GetElementValue(policy, "Value")
                        ?? GetElementValue(policy, "SettingString")
                        ?? GetElementValue(policy, "SettingNumber")
                        ?? policy.Attribute("Value")?.Value;

                    settings.Add(new GpoSetting
                    {
                        GpoId = gpoId.ToString(),
                        GpoDisplayName = gpoDisplayName,
                        Scope = scope,
                        Extension = extensionName,
                        Category = category ?? string.Empty,
                        Name = name,
                        Path = path,
                        Value = value
                    });
                }
            }

            foreach (var policy in scopeElement.Descendants().Where(e => e.Name.LocalName == "Policy"))
            {
                if (settings.Any(s => ReferenceEquals(s, policy)))
                {
                    continue;
                }

                var name = GetElementValue(policy, "Name") ?? policy.Attribute("Name")?.Value ?? "Unnamed";
                if (settings.Any(s => s.Name == name && s.Scope == scope))
                {
                    continue;
                }

                settings.Add(new GpoSetting
                {
                    GpoId = gpoId.ToString(),
                    GpoDisplayName = gpoDisplayName,
                    Scope = scope,
                    Extension = "Policy",
                    Category = GetElementValue(policy, "Category") ?? string.Empty,
                    Name = name,
                    Path = GetElementValue(policy, "KeyPath") ?? GetElementValue(policy, "Key"),
                    Value = GetElementValue(policy, "Value") ?? GetElementValue(policy, "State")
                });
            }
        }

        return settings;
    }

    private static bool TryParseScope(string scopeName, out GpoSettingScope scope)
    {
        scope = scopeName.ToLowerInvariant() switch
        {
            "computer" => GpoSettingScope.Computer,
            "user" => GpoSettingScope.User,
            _ => default
        };

        return scopeName.Equals("Computer", StringComparison.OrdinalIgnoreCase)
            || scopeName.Equals("User", StringComparison.OrdinalIgnoreCase);
    }

    private static string? GetElementValue(XElement parent, string localName)
    {
        return parent.Elements().FirstOrDefault(e => e.Name.LocalName == localName)?.Value
            ?? parent.Descendants().FirstOrDefault(e => e.Name.LocalName == localName && e.Parent == parent)?.Value;
    }
}
