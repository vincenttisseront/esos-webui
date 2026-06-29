using GpoManager.App.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;

namespace GpoManager.App.Views;

public sealed partial class AnalysisPage : Page
{
    public AnalysisViewModel ViewModel { get; }

    public AnalysisPage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<AnalysisViewModel>();
        DataContext = ViewModel;
    }
}
