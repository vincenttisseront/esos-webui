using GpoManager.App.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App.Views;

public sealed partial class ConnectionPage : Page
{
    public ConnectionViewModel ViewModel { get; }

    public ConnectionPage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<ConnectionViewModel>();
        DataContext = ViewModel;
    }
}
