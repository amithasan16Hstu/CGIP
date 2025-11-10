<?php
// Saves enhanced PNG sent as Data URL into /output directory.
header('Content-Type: application/json');
try {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!isset($data['imageData'])) { echo json_encode(['ok'=>false,'error'=>'No imageData provided']); exit; }
  $imgData = $data['imageData'];
  if (strpos($imgData, 'data:image/png;base64,') !== 0) { echo json_encode(['ok'=>false,'error'=>'Invalid data URL']); exit; }
  $base64 = substr($imgData, strlen('data:image/png;base64,'));
  $bin = base64_decode($base64);

  $outDir = __DIR__ . '/output';
  if (!is_dir($outDir)) { if (!mkdir($outDir, 0775, true) && !is_dir($outDir)) { echo json_encode(['ok'=>false,'error'=>'Failed to create output dir']); exit; } }

  $filename = 'enhanced_' . date('Ymd_His') . '.png';
  $fullpath = $outDir . '/' . $filename;
  if (file_put_contents($fullpath, $bin) === false) { echo json_encode(['ok'=>false,'error'=>'Write failed']); exit; }

  $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
  $base   = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
  $url    = $scheme . '://' . $host . $base . '/output/' . $filename;

  echo json_encode(['ok'=>true,'url'=>$url]);
} catch (Throwable $e) {
  echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
}
