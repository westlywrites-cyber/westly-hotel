import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Hotel, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
          <Hotel className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h1 className="font-serif text-6xl font-bold text-foreground mb-3">404</h1>
          <h2 className="text-2xl font-semibold text-foreground mb-2">Page Not Found</h2>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href="/">
            <Button className="gap-2">
              <Home className="w-4 h-4" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
