using GpoManager.App.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App.Views;

public sealed partial class GpoEditorPage : Page
{
    public GpoEditorViewModel ViewModel { get; }

    public GpoEditorPage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<GpoEditorViewModel>();
        DataContext = ViewModel;
    }

    private async void GpoComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        await ViewModel.LoadSettingsCommand.ExecuteAsync(null);
    }
}
