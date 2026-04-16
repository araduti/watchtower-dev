"use client";

/**
 * ScrollX UI — Scroll-triggered animation wrappers.
 * Registry: scrollxui.dev
 *
 * Components that trigger CSS animations when elements enter the viewport
 * using Intersection Observer. Used for page reveals and section transitions.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface FadeInProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Animation direction */
  direction?: "up" | "right" | "none" | "scale";
  /** Stagger index for list items (1-6) */
  stagger?: number;
  /** Custom animation duration class */
  duration?: string;
}

/** ScrollX UI fade-in on scroll component */
export function FadeIn({
  direction = "up",
  stagger,
  duration,
  className,
  children,
  ...props
}: FadeInProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const animationClass = {
    up: "animate-fade-in-up",
    right: "animate-slide-in-right",
    none: "animate-fade-in",
    scale: "animate-scale-in",
  }[direction];

  const staggerClass = stagger ? `stagger-${Math.min(stagger, 6)}` : "";

  return (
    <div
      ref={ref}
      className={cn(
        isVisible ? animationClass : "opacity-0",
        staggerClass,
        duration,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface StaggerGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Animation direction for children */
  direction?: "up" | "right" | "none" | "scale";
}

/** ScrollX UI staggered animation group — auto-staggers direct children */
export function StaggerGroup({
  direction = "up",
  className,
  children,
  ...props
}: StaggerGroupProps) {
  return (
    <div className={cn("grid gap-4", className)} {...props}>
      {React.Children.map(children, (child, index) => (
        <FadeIn direction={direction} stagger={index + 1}>
          {child}
        </FadeIn>
      ))}
    </div>
  );
}
