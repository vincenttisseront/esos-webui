using GpoManager.App.Services;
using GpoManager.App.ViewModels;
using GpoManager.App.Views;
using GpoManager.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App.Views;

public sealed partial class GpoListPage : Page
{
    public GpoListViewModel ViewModel { get; }
    private readonly INavigationService _navigation;

    public GpoListPage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<GpoListViewModel>();
        _navigation = App.Services.GetRequiredService<INavigationService>();
        DataContext = ViewModel;
    }

    private void ViewDetails_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        if (sender is Button { Tag: GpoSummary gpo })
        {
            _navigation.Navigate(typeof(GpoDetailPage), gpo);
        }
    }

    private async void CopyButton_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        if (sender is Button { Tag: GpoSummary gpo })
        {
            await ViewModel.CopyGpoCommand.ExecuteAsync(gpo);
        }
    }

    private async void DeleteButton_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        if (sender is Button { Tag: GpoSummary gpo })
        {
            var dialog = new ContentDialog
            {
                Title = "Confirmer la suppression",
                Content = $"Supprimer le GPO « {gpo.DisplayName} » ? Cette action est irréversible.",
                PrimaryButtonText = "Supprimer",
                CloseButtonText = "Annuler",
                DefaultButton = ContentDialogButton.Close,
                XamlRoot = XamlRoot
            };

            if (await dialog.ShowAsync() == ContentDialogResult.Primary)
            {
                await ViewModel.DeleteGpoCommand.ExecuteAsync(gpo);
            }
        }
    }
}
