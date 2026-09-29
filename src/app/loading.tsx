import Spinner from "@/components/Spinner";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner size={28} />
    </div>
  );
}
