"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  description?: string;
}

interface OnboardingStepperProps {
  steps: Step[];
  currentStep: number;
}

export function OnboardingStepper({
  steps,
  currentStep,
}: OnboardingStepperProps) {
  return (
    <nav className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isComplete
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-2 border-primary text-primary"
                      : "border-2 border-muted text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  "text-sm hidden sm:inline",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-8 sm:w-12",
                  isComplete ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
