# GPO Manager

Application client lourd Windows pour la gestion des **Group Policy Objects (GPO)** Active Directory.

## Fonctionnalités

- **Inventaire** — lister, filtrer et rechercher les GPO du domaine
- **CRUD** — créer, copier, renommer, supprimer, sauvegarder et restaurer des GPO
- **Liens** — visualiser et gérer les liens GPO sur les OU, domaines et sites
- **Arborescence AD** — navigation dans les unités d'organisation avec GPO liés
- **Analyse** — détection des duplications, conflits, GPO orphelins/vides
- **Éditeur** — visualisation des paramètres (XML) et édition des clés registre
- **Export** — rapports HTML et CSV
- **Audit** — journal local des actions dans `%AppData%\GpoManager\audit.log`

## Prérequis

| Composant | Détail |
|-----------|--------|
| Système | Windows 10/11 ou Windows Server 2019+ |
| RSAT | **Outils de gestion de stratégie de groupe** (GPMC) activés |
| Domaine | Poste joint au domaine ou accès réseau au contrôleur de domaine |
| Droits | `Edit Settings` sur les GPO, `Link GPOs` sur les cibles |
| Développement | .NET 8 SDK, Visual Studio 2022 17.8+, Windows App SDK |

### Installation RSAT (PowerShell administrateur)

```powershell
# Windows 11
Add-WindowsCapability -Online -Name "Rsat.GroupPolicy.Management.Tools~~~~0.0.1.0"

# Windows Server
Install-WindowsFeature GPMC
```

Vérifier le module GroupPolicy :

```powershell
Get-Command -Module GroupPolicy
```

## Architecture

```
gpo-manager/
├── src/
│   ├── GpoManager.App/           # WinUI 3 — interface utilisateur
│   ├── GpoManager.Core/          # Modèles et interfaces
│   ├── GpoManager.Infrastructure/# Services PowerShell, AD, audit
│   └── GpoManager.Analysis/      # Parser XML, analyse, export
└── tests/
    └── GpoManager.Analysis.Tests/
```

## Compilation

```powershell
cd gpo-manager
dotnet restore
dotnet build GpoManager.sln -c Release
```

> **Note :** la compilation complète (projet `GpoManager.App`) nécessite Windows avec le Windows App SDK. Les projets `Core`, `Analysis` et les tests peuvent être compilés sur tout OS supporté par .NET 8.

## Publication

```powershell
.\scripts\publish.ps1 -Configuration Release
```

L'exécutable self-contained est généré dans `artifacts/publish/`.

## Tests

```powershell
dotnet test tests/GpoManager.Analysis.Tests/GpoManager.Analysis.Tests.csproj
```

## Utilisation

1. Lancer `GpoManager.App.exe` avec un compte disposant des droits GPO
2. Vérifier la connexion AD (menu **Connexion**)
3. Parcourir la **Liste GPO** ou l'**Arborescence AD**
4. Lancer une **Analyse** pour détecter duplications et conflits
5. Utiliser l'**Éditeur** pour consulter ou modifier des paramètres registre

## Sécurité

- Aucun mot de passe stocké — authentification via le contexte Windows
- Confirmation obligatoire avant suppression de GPO
- Journal d'audit local de toutes les opérations de modification

## Licence

Projet interne — voir le dépôt parent pour les conditions d'utilisation.
