using GpoManager.App.Services;
using GpoManager.App.ViewModels;
using GpoManager.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;

namespace GpoManager.App;

public partial class App : Application
{
    private Window? _window;

    public static IServiceProvider Services { get; private set; } = null!;

    public App()
    {
        InitializeComponent();
        Services = ConfigureServices();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        services.AddSingleton<INavigationService, NavigationService>();
        services.AddGpoManagerInfrastructure();
        services.AddSingleton<MainViewModel>();
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<GpoListViewModel>();
        services.AddTransient<GpoDetailViewModel>();
        services.AddTransient<AdTreeViewModel>();
        services.AddTransient<AnalysisViewModel>();
        services.AddTransient<GpoEditorViewModel>();
        services.AddTransient<ConnectionViewModel>();
        return services.BuildServiceProvider();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
