using Microsoft.EntityFrameworkCore;

namespace AtletaEmFoco.Api.Data;

public class AtletaEmFocoDbContext : DbContext
{
    public AtletaEmFocoDbContext(DbContextOptions<AtletaEmFocoDbContext> options)
        : base(options)
    {
    }

    public DbSet<Evaluation> Evaluations => Set<Evaluation>();
    public DbSet<PreTrainingResponse> PreTrainingResponses => Set<PreTrainingResponse>();
    public DbSet<PainRegion> PainRegions => Set<PainRegion>();
    public DbSet<PostTrainingResponse> PostTrainingResponses => Set<PostTrainingResponse>();
    public DbSet<Athlete> Athletes => Set<Athlete>();
    public DbSet<AppUser> AppUsers => Set<AppUser>();
    public DbSet<TrainingSession> TrainingSessions => Set<TrainingSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Evaluation>(entity =>
        {
            entity.ToTable("Evaluation", "public");
            entity.HasKey(x => x.EvaluationId);
            entity.Property(x => x.EvaluationType)
                .HasMaxLength(10);
            entity.Property(x => x.SubmittedAt).HasColumnType("timestamp(0) with time zone");
            entity.HasIndex(x => new { x.AthleteId, x.TrainingSessionId, x.EvaluationType })
                .IsUnique();
        });

        modelBuilder.Entity<TrainingSession>(entity =>
        {
            entity.ToTable("TrainingSession", "public");
            entity.HasKey(x => x.TrainingSessionId);
            entity.Property(x => x.SessionType).HasMaxLength(20);
            entity.Property(x => x.Description).HasMaxLength(250);
            entity.Property(x => x.StartsAt).HasColumnType("timestamp(0)");
        });

        modelBuilder.Entity<PreTrainingResponse>(entity =>
        {
            entity.ToTable("PreTrainingResponse", "public");
            entity.HasKey(x => x.EvaluationId);
            entity.Property(x => x.SleepHours).HasColumnType("numeric(4,2)");
            entity.HasOne<Evaluation>()
                .WithOne()
                .HasForeignKey<PreTrainingResponse>(x => x.EvaluationId);
        });

        modelBuilder.Entity<PainRegion>(entity =>
        {
            entity.ToTable("PainRegion", "public");
            entity.HasKey(x => new { x.EvaluationId, x.RegionCode });
            entity.Property(x => x.RegionCode)
                .HasMaxLength(30);
            entity.HasOne<PreTrainingResponse>()
                .WithMany()
                .HasForeignKey(x => x.EvaluationId);
        });

        modelBuilder.Entity<PostTrainingResponse>(entity =>
        {
            entity.ToTable("PostTrainingResponse", "public");
            entity.HasKey(x => x.EvaluationId);
            entity.HasOne<Evaluation>()
                .WithOne()
                .HasForeignKey<PostTrainingResponse>(x => x.EvaluationId);
        });

        modelBuilder.Entity<Athlete>(entity =>
        {
            entity.ToTable("Athlete", "public");
            entity.HasKey(x => x.AthleteId);
            entity.Property(x => x.FullName).HasMaxLength(150);
        });

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("AppUser", "public");
            entity.HasKey(x => x.AppUserId);
            entity.Property(x => x.Username).HasMaxLength(254);
            entity.Property(x => x.PasswordHash).HasMaxLength(500);
            entity.Property(x => x.Role).HasMaxLength(20);
        });
    }
}

public class Evaluation
{
    public long EvaluationId { get; set; }
    public int AthleteId { get; set; }
    public int SubmittedByUserId { get; set; }
    public int? TrainingSessionId { get; set; }
    public string EvaluationType { get; set; } = "";
    public DateTime SubmittedAt { get; set; }
}

public class TrainingSession
{
    public int TrainingSessionId { get; set; }
    public DateTime StartsAt { get; set; }
    public string SessionType { get; set; } = "Training";
    public string? Description { get; set; }
}

public class PreTrainingResponse
{
    public long EvaluationId { get; set; }
    public byte Recovery { get; set; }
    public decimal SleepHours { get; set; }
    public byte SleepQuality { get; set; }
    public byte Stress { get; set; }
    public byte MuscleFatigue { get; set; }
    public byte Hydration { get; set; }
    public bool NoPain { get; set; }
}

public class PainRegion
{
    public long EvaluationId { get; set; }
    public string RegionCode { get; set; } = "";
}

public class PostTrainingResponse
{
    public long EvaluationId { get; set; }
    public byte Effort { get; set; }
    public short DurationMinutes { get; set; }
}

public class Athlete
{
    public int AthleteId { get; set; }
    public string FullName { get; set; } = "";
}

public class AppUser
{
    public int AppUserId { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "";
    public int? AthleteId { get; set; }
    public bool IsActive { get; set; }
}
