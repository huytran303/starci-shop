import { Button, Typography } from "@heroui/react";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-foreground">
      <Typography.Heading level={1}>StarCi Shop</Typography.Heading>
      <Typography.Paragraph className="max-w-md text-muted">
        Khung UI nền cho cửa hàng — mọi feature sau sẽ render ở đây.
      </Typography.Paragraph>
      <Button>Khám phá cửa hàng</Button>
    </main>
  );
}
