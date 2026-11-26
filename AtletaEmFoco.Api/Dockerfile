FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY AtletaEmFoco.Api.csproj ./
RUN dotnet restore AtletaEmFoco.Api.csproj

COPY . ./
RUN dotnet publish AtletaEmFoco.Api.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

EXPOSE 8080
ENTRYPOINT ["dotnet", "AtletaEmFoco.Api.dll"]
