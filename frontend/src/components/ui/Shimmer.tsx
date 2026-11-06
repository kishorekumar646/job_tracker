import React from "react";

interface ShimmerProps {
  className?: string;
}

export default function Shimmer({ className }: ShimmerProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}