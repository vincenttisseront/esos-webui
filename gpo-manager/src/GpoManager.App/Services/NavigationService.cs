namespace GpoManager.App.Services;

using Microsoft.UI.Xaml.Controls;

public interface INavigationService
{
    void Navigate(Type pageType, object? parameter = null);
    void GoBack();
}

public sealed class NavigationService : INavigationService
{
    private Frame? _frame;

    public void SetFrame(Frame frame) => _frame = frame;

    public void Navigate(Type pageType, object? parameter = null)
    {
        _frame?.Navigate(pageType, parameter);
    }

    public void GoBack()
    {
        if (_frame?.CanGoBack == true)
        {
            _frame.GoBack();
        }
    }
}
