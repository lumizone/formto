import { Card, CardContent } from "@/components/ui/card"
import { formatNumber } from "@/lib/utils"

export default function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  loading = false,
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {Icon && (
            <div className="p-2 bg-muted rounded-lg">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        {loading ? (
          <div className="h-8 w-20 bg-muted animate-pulse rounded mt-2" />
        ) : (
          <div className="mt-2">
            <span className="text-2xl font-semibold tracking-tight">
              {formatNumber(value)}
            </span>
            {description && (
              <span className="text-sm text-muted-foreground ml-1.5">
                {description}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
