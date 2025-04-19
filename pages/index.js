import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Artem Lost In Time</h1>
      <p>Это главная страница.</p>
      <p>
        <Link href="/admin">
          <a>Перейти к управлению записями</a>
        </Link>
      </p>
    </div>
  );
}
