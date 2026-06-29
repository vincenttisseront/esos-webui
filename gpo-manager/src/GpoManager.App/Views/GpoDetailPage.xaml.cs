using GpoManager.App.ViewModels;
using GpoManager.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace GpoManager.App.Views;

public sealed partial class GpoDetailPage : Page
{
    public GpoDetailViewModel ViewModel { get; }

    public GpoDetailPage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<GpoDetailViewModel>();
        DataContext = ViewModel;
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is Guid gpoId)
        {
            await ViewModel.LoadAsync(gpoId);
        }
        else if (e.Parameter is GpoSummary summary)
        {
            await ViewModel.LoadAsync(summary.Id);
        }
    }
}
