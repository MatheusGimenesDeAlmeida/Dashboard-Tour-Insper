"""Plataforma de Agendamento de Tour no Campus — Insper (v1).

Uso:
  python3 run.py              inicia o servidor em http://localhost:8000 (cria e popula o banco na 1ª vez)
  python3 run.py --reset      apaga o banco, recria com dados de exemplo e inicia
  python3 run.py --port 8080  outra porta
"""
import argparse
import os
import sys

from app import core, seed, server


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    p.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    p.add_argument("--reset", action="store_true", help="recria o banco com dados de exemplo")
    p.add_argument("--no-seed", action="store_true", help="não carregar dados de exemplo num banco novo")
    p.add_argument("--no-scheduler", action="store_true", help="não rodar os jobs automáticos")
    args = p.parse_args()

    if args.reset:
        for suffix in ("", "-wal", "-shm"):
            if os.path.exists(core.DATABASE_PATH + suffix):
                os.remove(core.DATABASE_PATH + suffix)
    fresh = not os.path.exists(core.DATABASE_PATH)
    conn = core.connect()
    core.init_db(conn)
    if fresh and not args.no_seed:
        print("Criando banco com dados de exemplo…")
        seed.seed(conn)
    conn.close()

    httpd = server.serve(args.host, args.port, scheduler=not args.no_scheduler)
    url = f"http://localhost:{args.port}" if args.host in ("127.0.0.1", "0.0.0.0") else f"http://{args.host}:{args.port}"
    print(f"Plataforma de tours no ar em {url}")
    print(f"  Agendar visita ........ {url}/agendar")
    print(f"  Portal do embaixador .. {url}/embaixador")
    print(f"  Painel de Admissões ... {url}/admin")
    print(f"  Caixa de entrada (dev)  {url}/caixa-de-entrada")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando.")
        sys.exit(0)


if __name__ == "__main__":
    main()
