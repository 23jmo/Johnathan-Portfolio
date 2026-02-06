import Image from "next/image";

interface InlineLogoProps {
  src: string;
  alt: string;
  size?: number;
}

export default function InlineLogo({ src, alt, size = 28 }: InlineLogoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="inline-block rounded-full align-middle mx-1"
      unoptimized
    />
  );
}
