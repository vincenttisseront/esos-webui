using GpoManager.App.Services;
using GpoManager.App.ViewModels;
using GpoManager.App.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App;

public sealed partial class MainWindow : Window
{
    private readonly Dictionary<string, Type> _pages = new()
    {
        ["Dashboard"] = typeof(DashboardPage),
        ["Connection"] = typeof(ConnectionPage),
        ["GpoList"] = typeof(GpoListPage),
        ["AdTree"] = typeof(AdTreePage),
        ["Analysis"] = typeof(AnalysisPage),
        ["Editor"] = typeof(GpoEditorPage)
    };

    public MainViewModel ViewModel { get; }
    private readonly INavigationService _navigation;

    public MainWindow()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<MainViewModel>();
        _navigation = App.Services.GetRequiredService<INavigationService>();
        if (_navigation is NavigationService nav)
        {
            nav.SetFrame(ContentFrame);
        }
        RootNavigation.DataContext = ViewModel;
        Title = "GPO Manager — Active Directory";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        ContentFrame.Navigate(typeof(DashboardPage));
        _ = ViewModel.InitializeAsync();
    }

    private void NavigationView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item && item.Tag is string tag && _pages.TryGetValue(tag, out var pageType))
        {
            ViewModel.NavigateTo(tag);
            ContentFrame.Navigate(pageType);
        }
    }
}
