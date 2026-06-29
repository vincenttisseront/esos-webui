using GpoManager.App.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App.Views;

public sealed partial class AdTreePage : Page
{
    public AdTreeViewModel ViewModel { get; }

    public AdTreePage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<AdTreeViewModel>();
        DataContext = ViewModel;
    }
}
