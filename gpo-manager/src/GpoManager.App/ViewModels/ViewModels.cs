using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using GpoManager.App.Views;
using GpoManager.Core.Interfaces;
using GpoManager.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly IServiceProvider _services;
    private readonly IActiveDirectoryService _adService;

    [ObservableProperty]
    private string _domainName = "Non connecté";

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    [ObservableProperty]
    private object? _currentPage;

    public MainViewModel(IServiceProvider services, IActiveDirectoryService adService)
    {
        _services = services;
        _adService = adService;
        CurrentPage = _services.GetRequiredService<DashboardViewModel>();
    }

    public async Task InitializeAsync()
    {
        try
        {
            var info = await _adService.GetConnectionInfoAsync();
            DomainName = info.IsConnected ? info.DomainName : "Non connecté";
            StatusMessage = info.IsConnected
                ? $"Connecté en tant que {info.UserName}"
                : info.ErrorMessage ?? "Connexion AD indisponible";
        }
        catch (Exception ex)
        {
            DomainName = "Non connecté";
            StatusMessage = ex.Message;
        }
    }

    public void NavigateTo(string tag)
    {
        CurrentPage = tag switch
        {
            "Dashboard" => _services.GetRequiredService<DashboardViewModel>(),
            "Connection" => _services.GetRequiredService<ConnectionViewModel>(),
            "GpoList" => _services.GetRequiredService<GpoListViewModel>(),
            "AdTree" => _services.GetRequiredService<AdTreeViewModel>(),
            "Analysis" => _services.GetRequiredService<AnalysisViewModel>(),
            "Editor" => _services.GetRequiredService<GpoEditorViewModel>(),
            _ => _services.GetRequiredService<DashboardViewModel>()
        };
    }
}

public partial class DashboardViewModel : ObservableObject
{
    private readonly IGpoRepository _repository;
    private readonly IGpoAnalyzer _analyzer;

    [ObservableProperty] private int _totalGpos;
    [ObservableProperty] private int _orphanedGpos;
    [ObservableProperty] private int _conflictCount;
    [ObservableProperty] private DateTime? _lastAnalysis;
    [ObservableProperty] private bool _isLoading;
    [ObservableProperty] private string _errorMessage = string.Empty;

    public DashboardViewModel(IGpoRepository repository, IGpoAnalyzer analyzer)
    {
        _repository = repository;
        _analyzer = analyzer;
        _ = LoadAsync();
    }

    [RelayCommand]
    private async Task LoadAsync()
    {
        IsLoading = true;
        ErrorMessage = string.Empty;
        try
        {
            var gpos = await _repository.GetAllAsync();
            TotalGpos = gpos.Count;
            OrphanedGpos = gpos.Count(g => g.IsOrphaned);

            var result = await _analyzer.AnalyzeAsync(gpos, _repository.ExportXmlReportAsync);
            ConflictCount = result.ConflictCount;
            LastAnalysis = result.AnalyzedAt;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }
}

public partial class ConnectionViewModel : ObservableObject
{
    private readonly IActiveDirectoryService _adService;

    [ObservableProperty] private DomainConnectionInfo? _connectionInfo;
    [ObservableProperty] private bool _isTesting;
    [ObservableProperty] private string _statusMessage = string.Empty;

    public ConnectionViewModel(IActiveDirectoryService adService)
    {
        _adService = adService;
        _ = RefreshAsync();
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        ConnectionInfo = await _adService.GetConnectionInfoAsync();
        StatusMessage = ConnectionInfo.IsConnected
            ? $"Domaine : {ConnectionInfo.DomainName}"
            : ConnectionInfo.ErrorMessage ?? "Déconnecté";
    }

    [RelayCommand]
    private async Task TestConnectionAsync()
    {
        IsTesting = true;
        try
        {
            ConnectionInfo = await _adService.TestConnectionAsync();
            StatusMessage = ConnectionInfo.IsConnected
                ? "Connexion réussie"
                : ConnectionInfo.ErrorMessage ?? "Échec de connexion";
        }
        finally
        {
            IsTesting = false;
        }
    }
}

public partial class GpoListViewModel : ObservableObject
{
    private readonly IGpoRepository _repository;
    private readonly IAuditLogger _auditLogger;

    [ObservableProperty] private List<GpoSummary> _gpos = [];
    [ObservableProperty] private GpoSummary? _selectedGpo;
    [ObservableProperty] private string _searchText = string.Empty;
    [ObservableProperty] private bool _isLoading;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private string _newGpoName = string.Empty;
    [ObservableProperty] private string _newGpoDescription = string.Empty;

    public GpoListViewModel(IGpoRepository repository, IAuditLogger auditLogger)
    {
        _repository = repository;
        _auditLogger = auditLogger;
        _ = LoadAsync();
    }

    public IEnumerable<GpoSummary> FilteredGpos => string.IsNullOrWhiteSpace(SearchText)
        ? Gpos
        : Gpos.Where(g => g.DisplayName.Contains(SearchText, StringComparison.OrdinalIgnoreCase)
            || g.Id.ToString().Contains(SearchText, StringComparison.OrdinalIgnoreCase));

    partial void OnSearchTextChanged(string value) => OnPropertyChanged(nameof(FilteredGpos));

    [RelayCommand]
    private async Task LoadAsync()
    {
        IsLoading = true;
        ErrorMessage = string.Empty;
        try
        {
            Gpos = (await _repository.GetAllAsync()).ToList();
            OnPropertyChanged(nameof(FilteredGpos));
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task CreateGpoAsync()
    {
        if (string.IsNullOrWhiteSpace(NewGpoName))
        {
            ErrorMessage = "Le nom du GPO est requis.";
            return;
        }

        try
        {
            await _repository.CreateAsync(new CreateGpoRequest
            {
                DisplayName = NewGpoName,
                Description = string.IsNullOrWhiteSpace(NewGpoDescription) ? null : NewGpoDescription
            });
            NewGpoName = string.Empty;
            NewGpoDescription = string.Empty;
            await LoadAsync();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
    }

    [RelayCommand]
    private async Task DeleteGpoAsync(GpoSummary? gpo)
    {
        if (gpo is null) return;
        try
        {
            await _repository.DeleteAsync(gpo.Id);
            await LoadAsync();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
    }

    [RelayCommand]
    private async Task CopyGpoAsync(GpoSummary? gpo)
    {
        if (gpo is null) return;
        try
        {
            await _repository.CopyAsync(gpo.Id, $"{gpo.DisplayName} (copie)");
            await LoadAsync();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
    }
}

public partial class GpoDetailViewModel : ObservableObject
{
    private readonly IGpoRepository _repository;
    private readonly IGpoLinkService _linkService;

    [ObservableProperty] private GpoDetail? _detail;
    [ObservableProperty] private bool _isLoading;
    [ObservableProperty] private string _errorMessage = string.Empty;

    public GpoDetailViewModel(IGpoRepository repository, IGpoLinkService linkService)
    {
        _repository = repository;
        _linkService = linkService;
    }

    public async Task LoadAsync(Guid gpoId)
    {
        IsLoading = true;
        try
        {
            Detail = await _repository.GetByIdAsync(gpoId);
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task RefreshLinksAsync()
    {
        if (Detail is null) return;
        var links = await _linkService.GetLinksForGpoAsync(Detail.Summary.Id);
        Detail = Detail with { Links = links };
    }
}

public partial class AdTreeViewModel : ObservableObject
{
    private readonly IActiveDirectoryService _adService;

    [ObservableProperty] private AdTreeNode? _domainTree;
    [ObservableProperty] private AdTreeNode? _selectedNode;
    [ObservableProperty] private bool _isLoading;
    [ObservableProperty] private string _errorMessage = string.Empty;

    public AdTreeViewModel(IActiveDirectoryService adService)
    {
        _adService = adService;
        _ = LoadAsync();
    }

    [RelayCommand]
    private async Task LoadAsync()
    {
        IsLoading = true;
        ErrorMessage = string.Empty;
        try
        {
            DomainTree = await _adService.GetDomainTreeAsync();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }
}

public partial class AnalysisViewModel : ObservableObject
{
    private readonly IGpoRepository _repository;
    private readonly IGpoAnalyzer _analyzer;
    private readonly IReportExporter _exporter;

    [ObservableProperty] private GpoAnalysisResult? _result;
    [ObservableProperty] private bool _isAnalyzing;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private string _exportPath = string.Empty;

    public AnalysisViewModel(IGpoRepository repository, IGpoAnalyzer analyzer, IReportExporter exporter)
    {
        _repository = repository;
        _analyzer = analyzer;
        _exporter = exporter;
    }

    [RelayCommand]
    private async Task RunAnalysisAsync()
    {
        IsAnalyzing = true;
        ErrorMessage = string.Empty;
        try
        {
            var gpos = await _repository.GetAllAsync();
            Result = await _analyzer.AnalyzeAsync(gpos, _repository.ExportXmlReportAsync);
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsAnalyzing = false;
        }
    }

    [RelayCommand]
    private async Task ExportHtmlAsync()
    {
        if (Result is null) return;
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            $"GpoAnalysis_{DateTime.Now:yyyyMMdd_HHmmss}.html");
        await _exporter.ExportHtmlAsync(Result, path);
        ExportPath = path;
    }

    [RelayCommand]
    private async Task ExportCsvAsync()
    {
        if (Result is null) return;
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            $"GpoAnalysis_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
        await _exporter.ExportCsvAsync(Result, path);
        ExportPath = path;
    }
}

public partial class GpoEditorViewModel : ObservableObject
{
    private readonly IGpoRepository _repository;
    private readonly IGpoEditor _editor;

    [ObservableProperty] private List<GpoSummary> _gpos = [];
    [ObservableProperty] private GpoSummary? _selectedGpo;
    [ObservableProperty] private List<GpoSetting> _settings = [];
    [ObservableProperty] private string _searchQuery = string.Empty;
    [ObservableProperty] private List<GpoSetting> _searchResults = [];
    [ObservableProperty] private bool _isLoading;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private string _registryKeyPath = string.Empty;
    [ObservableProperty] private string _registryValueName = string.Empty;
    [ObservableProperty] private string _registryValue = string.Empty;
    [ObservableProperty] private GpoSettingScope _selectedScope = GpoSettingScope.Computer;

    public GpoEditorViewModel(IGpoRepository repository, IGpoEditor editor)
    {
        _repository = repository;
        _editor = editor;
        _ = LoadGposAsync();
    }

    [RelayCommand]
    private async Task LoadGposAsync()
    {
        Gpos = (await _repository.GetAllAsync()).ToList();
    }

    [RelayCommand]
    private async Task LoadSettingsAsync()
    {
        if (SelectedGpo is null) return;
        IsLoading = true;
        try
        {
            Settings = (await _editor.GetSettingsAsync(SelectedGpo.Id)).ToList();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task SearchAsync()
    {
        if (string.IsNullOrWhiteSpace(SearchQuery)) return;
        IsLoading = true;
        try
        {
            SearchResults = (await _editor.SearchSettingsAsync(SearchQuery)).ToList();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task SaveRegistrySettingAsync()
    {
        if (SelectedGpo is null) return;
        try
        {
            await _editor.UpdateRegistrySettingAsync(new UpdateRegistrySettingRequest
            {
                GpoId = SelectedGpo.Id,
                Scope = SelectedScope,
                KeyPath = RegistryKeyPath,
                ValueName = RegistryValueName,
                Value = RegistryValue
            });
            await LoadSettingsAsync();
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
    }
}
