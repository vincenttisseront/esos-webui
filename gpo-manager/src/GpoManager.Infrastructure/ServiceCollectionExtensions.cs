using GpoManager.Analysis;
using GpoManager.Core.Interfaces;
using GpoManager.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace GpoManager.Infrastructure;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddGpoManagerInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IAuditLogger, FileAuditLogger>();
        services.AddSingleton<IGpoRepository, GpoRepository>();
        services.AddSingleton<IGpoLinkService, GpoLinkService>();
        services.AddSingleton<IActiveDirectoryService, ActiveDirectoryService>();
        services.AddSingleton<IGpoEditor, GpoEditor>();
        services.AddSingleton<IGpoAnalyzer, GpoAnalyzer>();
        services.AddSingleton<IReportExporter, ReportExporter>();
        return services;
    }
}
