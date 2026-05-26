from __future__ import annotations

import os
import queue
import threading
from pathlib import Path
from typing import Callable, Optional

import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk

from config.paths import CAPTURES_DIR, FAVICON_PATH, LOGO_PATH
from config.providers import AI_PROVIDERS, DEFAULT_PROVIDER, PASTE_MODES, PROVIDERS_BY_NAME
from config.settings import AppSettings, load_settings, save_settings
from config.theme import COLORS, FONTS
from models.capture import CaptureResult
from services.browser_service import BrowserService
from services.capture_service import ScreenCaptureService
from services.clipboard_service import ClipboardService
from services.hotkey_service import HotkeyService
from services.ocr_service import OCRService, OCRResult
from services.scroll_service import ScrollService
from ui.components import ScrollableFrame
from utils.image_utils import load_photo
from utils.platform_utils import beep, paste_hotkey, set_dpi_awareness


STATUS_COLORS = {
    "ready": COLORS["teal"],
    "working": COLORS["warning"],
    "success": COLORS["success"],
    "error": COLORS["danger"],
    "scroll": COLORS["teal"],
}

COMMAND_ICONS = {
    "crop": "crop.png",
    "scroll_down": "scroll_down.png",
    "scroll_up": "scroll_up.png",
    "stop": "stop.png",
    "copy": "copy.png",
    "paste": "paste.png",
    "text": "text.png",
    "image": "image.png",
    "open": "open.png",
}


class OlheiroApp:
    def __init__(self, root: tk.Tk) -> None:
        set_dpi_awareness()
        self.root = root
        self.root.title("Olheiro")
        self.root.geometry("1120x760")
        self.root.minsize(920, 650)
        self.root.configure(bg=COLORS["bg"])
        self.root.protocol("WM_DELETE_WINDOW", self.close)

        self.settings = load_settings()
        self.action_queue: "queue.Queue[str]" = queue.Queue()
        self.history: list[CaptureResult] = []
        self.current_result: Optional[CaptureResult] = None
        self._settings_ready = False

        self.browser_service = BrowserService()
        self.capture_service = ScreenCaptureService()
        self.clipboard_service = ClipboardService(root)
        self.ocr_service = OCRService()
        self.scroll_service = ScrollService(self._handle_scroll_status)
        self.hotkey_service = HotkeyService(self.enqueue_action)

        self.app_icon: Optional[ImageTk.PhotoImage] = None
        self.brand_logo: Optional[ImageTk.PhotoImage] = None
        self.preview_photo: Optional[ImageTk.PhotoImage] = None
        self.ai_icons: dict[str, ImageTk.PhotoImage] = {}
        self.command_icons: dict[str, ImageTk.PhotoImage] = {}

        self.ai_var = tk.StringVar(value=self.settings.ai_provider)
        self.mode_var = tk.StringVar(value=self.settings.paste_mode)
        self.delay_var = tk.StringVar(value=str(self.settings.paste_delay_seconds))
        self.auto_open_var = tk.BooleanVar(value=self.settings.auto_open_after_capture)
        self.auto_copy_var = tk.BooleanVar(value=self.settings.auto_copy_after_capture)
        self.auto_paste_var = tk.BooleanVar(value=self.settings.auto_paste_after_delay)
        self.save_captures_var = tk.BooleanVar(value=self.settings.save_captures)
        self.scroll_speed_var = tk.IntVar(value=self.settings.scroll_speed)
        self.status_text_var = tk.StringVar(value="Pronto")
        self.result_title_var = tk.StringVar(value="Nenhum recorte ainda")
        self.result_meta_var = tk.StringVar(value="Use Recortar tela para iniciar.")
        self.system_ocr_var = tk.StringVar(value=self.ocr_service.status)
        self.system_capture_var = tk.StringVar(value=str(CAPTURES_DIR))
        self.system_hotkey_var = tk.StringVar(value="Inicializando...")
        self.system_scroll_var = tk.StringVar(value="Parado")
        self.speed_label_var = tk.StringVar(value=f"{self.settings.scroll_speed}/10")

        self._configure_ttk()
        self._load_assets()
        self._build_layout()
        self._wire_settings()
        self._settings_ready = True
        self._start_hotkeys()
        self._log("Olheiro iniciado.")
        self.set_status("Pronto", "ready")
        self.root.after(80, self._process_actions)

    def _configure_ttk(self) -> None:
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("App.TFrame", background=COLORS["bg"])
        style.configure("TFrame", background=COLORS["bg"])
        style.configure("TCheckbutton", background=COLORS["surface"], foreground=COLORS["muted"], font=FONTS["body"])
        style.configure("Horizontal.TScale", background=COLORS["surface"])

    def _load_assets(self) -> None:
        self.app_icon = load_photo(FAVICON_PATH, (64, 64), trim=False)
        if self.app_icon is not None:
            self.root.iconphoto(True, self.app_icon)
        self.brand_logo = load_photo(LOGO_PATH, (260, 84), trim=True)

        for provider in AI_PROVIDERS:
            icon = load_photo(provider.icon_path, (28, 28), trim=False)
            if icon is not None:
                self.ai_icons[provider.name] = icon

        icon_dir = Path(provider.icon_path).parent if AI_PROVIDERS else Path("assets/icons")
        for name, filename in COMMAND_ICONS.items():
            icon = load_photo(icon_dir / filename, (22, 22), trim=False)
            if icon is not None:
                self.command_icons[name] = icon

    def _build_layout(self) -> None:
        shell = tk.Frame(self.root, bg=COLORS["bg"])
        shell.pack(fill="both", expand=True)
        shell.grid_columnconfigure(1, weight=1)
        shell.grid_rowconfigure(0, weight=1)

        self._build_sidebar(shell)

        scroll_area = ScrollableFrame(shell)
        scroll_area.grid(row=0, column=1, sticky="nsew")
        main = scroll_area.content
        main.configure(padx=28, pady=24)

        self._build_header(main)
        self._build_ai_card(main)
        self._build_actions_card(main)
        self._build_capture_card(main)
        self._build_history_card(main)
        self._build_system_card(main)
        self._build_log_card(main)

    def _build_sidebar(self, parent: tk.Misc) -> None:
        sidebar = tk.Frame(parent, bg=COLORS["navy"], width=248)
        sidebar.grid(row=0, column=0, sticky="ns")
        sidebar.grid_propagate(False)

        content = tk.Frame(sidebar, bg=COLORS["navy"])
        content.pack(fill="both", expand=True, padx=22, pady=24)

        if self.app_icon is not None:
            tk.Label(content, image=self.app_icon, bg=COLORS["navy"], borderwidth=0).pack(anchor="w")
        tk.Label(content, text="Olheiro", bg=COLORS["navy"], fg="#ffffff", font=("Segoe UI", 22, "bold")).pack(
            anchor="w",
            pady=(14, 2),
        )
        tk.Label(
            content,
            text="Assistente local de estudo",
            bg=COLORS["navy"],
            fg="#b8d7e7",
            font=FONTS["body"],
        ).pack(anchor="w")

        tk.Frame(content, bg=COLORS["navy"], height=28).pack(fill="x")
        self._button(
            content,
            "Recortar tela",
            self.start_capture,
            "primary",
            icon=self.command_icons.get("crop"),
        ).pack(fill="x", pady=(0, 10))
        self._button(
            content,
            "Enviar para ChatGPT",
            self.send_to_chatgpt,
            "dark",
            icon=self.ai_icons.get("ChatGPT"),
        ).pack(fill="x", pady=(0, 10))
        self._button(
            content,
            "Colar agora",
            self.paste_now,
            "dark",
            icon=self.command_icons.get("paste"),
        ).pack(fill="x", pady=(0, 10))
        self._button(
            content,
            "Parar scroll",
            self.stop_scroll,
            "dark",
            icon=self.command_icons.get("stop"),
        ).pack(fill="x", pady=(0, 10))

        tk.Frame(content, bg=COLORS["navy"]).pack(fill="both", expand=True)
        tk.Label(
            content,
            text="Uso local, sem login salvo e sem envio automatico.",
            bg=COLORS["navy"],
            fg="#b8d7e7",
            wraplength=188,
            justify="left",
            font=FONTS["small"],
        ).pack(anchor="w")

    def _build_header(self, parent: tk.Misc) -> None:
        header = tk.Frame(parent, bg=COLORS["bg"])
        header.pack(fill="x", pady=(0, 18))
        header.grid_columnconfigure(0, weight=1)

        left = tk.Frame(header, bg=COLORS["bg"])
        left.grid(row=0, column=0, sticky="w")
        if self.brand_logo is not None:
            tk.Label(left, image=self.brand_logo, bg=COLORS["bg"], borderwidth=0).pack(anchor="w")
        else:
            tk.Label(left, text="Olheiro", bg=COLORS["bg"], fg=COLORS["navy"], font=FONTS["title"]).pack(anchor="w")
        tk.Label(
            left,
            text="Recorte, OCR, copia e colagem controlada para estudo.",
            bg=COLORS["bg"],
            fg=COLORS["muted"],
            font=FONTS["subtitle"],
        ).pack(anchor="w", pady=(6, 0))

        status = tk.Frame(header, bg=COLORS["surface"], highlightbackground=COLORS["border"], highlightthickness=1)
        status.grid(row=0, column=1, sticky="e", padx=(16, 0))
        self.status_dot = tk.Canvas(status, width=12, height=12, bg=COLORS["surface"], highlightthickness=0)
        self.status_dot.pack(side="left", padx=(12, 7), pady=10)
        self.status_dot_id = self.status_dot.create_oval(2, 2, 10, 10, fill=COLORS["teal"], outline="")
        tk.Label(status, textvariable=self.status_text_var, bg=COLORS["surface"], fg=COLORS["text"], font=FONTS["body"]).pack(
            side="left",
            padx=(0, 12),
            pady=10,
        )

    def _build_ai_card(self, parent: tk.Misc) -> None:
        body = self._card(parent, "Configuracao da IA", "Escolha destino, conteudo, prompt e automacoes locais.")
        body.grid_columnconfigure(1, weight=1)
        body.grid_columnconfigure(3, weight=1)

        self._field_label(body, "IA").grid(row=0, column=0, sticky="w", padx=(0, 12), pady=(0, 12))
        self._build_ai_menu(body).grid(row=0, column=1, sticky="ew", padx=(0, 14), pady=(0, 12))
        self._button(body, "Abrir IA", self.open_selected_ai, "secondary", icon=self.command_icons.get("open")).grid(
            row=0,
            column=2,
            sticky="ew",
            padx=(0, 14),
            pady=(0, 12),
        )
        self._button(body, "Enviar para ChatGPT", self.send_to_chatgpt, "ghost", icon=self.ai_icons.get("ChatGPT")).grid(
            row=0,
            column=3,
            sticky="ew",
            pady=(0, 12),
        )

        self._field_label(body, "Conteudo").grid(row=1, column=0, sticky="w", padx=(0, 12), pady=(0, 12))
        self._combo(body, self.mode_var, PASTE_MODES).grid(row=1, column=1, sticky="ew", padx=(0, 14), pady=(0, 12))

        self._field_label(body, "Delay").grid(row=1, column=2, sticky="w", padx=(0, 12), pady=(0, 12))
        self._combo(body, self.delay_var, ("3", "5", "8", "12")).grid(
            row=1,
            column=3,
            sticky="ew",
            pady=(0, 12),
        )

        checks = tk.Frame(body, bg=COLORS["surface"])
        checks.grid(row=2, column=0, columnspan=4, sticky="ew", pady=(0, 14))
        ttk.Checkbutton(checks, text="Abrir IA apos recorte", variable=self.auto_open_var).pack(side="left", padx=(0, 18))
        ttk.Checkbutton(checks, text="Copiar OCR/conteudo apos recorte", variable=self.auto_copy_var).pack(
            side="left",
            padx=(0, 18),
        )
        ttk.Checkbutton(checks, text="Colar automaticamente apos delay", variable=self.auto_paste_var).pack(
            side="left",
            padx=(0, 18),
        )
        ttk.Checkbutton(checks, text="Salvar prints em captures", variable=self.save_captures_var).pack(side="left")

        speed_row = tk.Frame(body, bg=COLORS["surface"])
        speed_row.grid(row=3, column=0, columnspan=4, sticky="ew", pady=(0, 14))
        speed_row.grid_columnconfigure(1, weight=1)
        self._field_label(speed_row, "Velocidade do scroll").grid(row=0, column=0, sticky="w", padx=(0, 12))
        scale = tk.Scale(
            speed_row,
            from_=1,
            to=10,
            orient="horizontal",
            variable=self.scroll_speed_var,
            command=self._on_scroll_speed_change,
            bg=COLORS["surface"],
            fg=COLORS["muted"],
            troughcolor=COLORS["teal_soft"],
            highlightthickness=0,
            showvalue=False,
        )
        scale.grid(row=0, column=1, sticky="ew", padx=(0, 12))
        tk.Label(speed_row, textvariable=self.speed_label_var, bg=COLORS["surface"], fg=COLORS["navy"], font=FONTS["body"]).grid(
            row=0,
            column=2,
            sticky="e",
        )

        tk.Label(body, text="Prompt padrao", bg=COLORS["surface"], fg=COLORS["text"], font=FONTS["card_title"]).grid(
            row=4,
            column=0,
            columnspan=4,
            sticky="w",
            pady=(0, 8),
        )
        self.prompt_text = tk.Text(
            body,
            height=4,
            wrap="word",
            bg=COLORS["surface_alt"],
            fg=COLORS["text"],
            relief="flat",
            padx=12,
            pady=10,
            font=FONTS["body"],
            insertbackground=COLORS["navy"],
        )
        self.prompt_text.grid(row=5, column=0, columnspan=4, sticky="ew")
        self.prompt_text.insert("1.0", self.settings.prompt_template)
        self.prompt_text.bind("<FocusOut>", lambda _event: self.save_preferences())

    def _build_actions_card(self, parent: tk.Misc) -> None:
        body = self._card(parent, "Acoes rapidas", "Atalhos e comandos principais ficam aqui.")
        for column in range(3):
            body.grid_columnconfigure(column, weight=1)

        buttons = (
            ("Recortar tela", self.start_capture, "primary", "crop"),
            ("Copiar OCR", self.copy_current_ocr, "secondary", "text"),
            ("Colar agora", self.paste_now, "secondary", "paste"),
            ("Scroll baixo", lambda: self.start_scroll("down"), "ghost", "scroll_down"),
            ("Scroll cima", lambda: self.start_scroll("up"), "ghost", "scroll_up"),
            ("Parar scroll", self.stop_scroll, "ghost", "stop"),
        )
        for index, (text, command, variant, icon_key) in enumerate(buttons):
            row = index // 3
            column = index % 3
            self._button(body, text, command, variant, icon=self.command_icons.get(icon_key)).grid(
                row=row,
                column=column,
                sticky="ew",
                padx=(0 if column == 0 else 8, 0),
                pady=(0 if row == 0 else 10, 0),
            )

    def _build_capture_card(self, parent: tk.Misc) -> None:
        body = self._card(parent, "Ultimo recorte e OCR", "Revise e edite o texto antes de copiar ou colar.")
        body.grid_columnconfigure(1, weight=1)
        body.grid_rowconfigure(2, weight=1)

        self.preview_label = tk.Label(
            body,
            bg=COLORS["surface_alt"],
            fg=COLORS["muted"],
            text="Preview",
            width=22,
            height=9,
            font=FONTS["body"],
        )
        self.preview_label.grid(row=0, column=0, rowspan=3, sticky="nsew", padx=(0, 18))

        tk.Label(body, textvariable=self.result_title_var, bg=COLORS["surface"], fg=COLORS["text"], font=FONTS["card_title"]).grid(
            row=0,
            column=1,
            sticky="w",
        )
        tk.Label(body, textvariable=self.result_meta_var, bg=COLORS["surface"], fg=COLORS["muted"], font=FONTS["body"]).grid(
            row=1,
            column=1,
            sticky="w",
            pady=(4, 8),
        )
        self.ocr_text = tk.Text(
            body,
            height=8,
            wrap="word",
            bg=COLORS["surface_alt"],
            fg=COLORS["text"],
            relief="flat",
            padx=12,
            pady=10,
            font=FONTS["body"],
            insertbackground=COLORS["navy"],
        )
        self.ocr_text.grid(row=2, column=1, sticky="nsew")
        self.ocr_text.insert("1.0", "O texto extraido por OCR aparecera aqui.")
        self.ocr_text.configure(state="disabled")

        actions = tk.Frame(body, bg=COLORS["surface"])
        actions.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(14, 0))
        for column in range(4):
            actions.grid_columnconfigure(column, weight=1)

        self.copy_ocr_button = self._button(actions, "Copiar OCR", self.copy_current_ocr, "secondary", self.command_icons.get("text"))
        self.copy_prompt_button = self._button(actions, "Copiar prompt", self.copy_prompt, "secondary", self.command_icons.get("copy"))
        self.copy_image_button = self._button(actions, "Copiar imagem", self.copy_image, "secondary", self.command_icons.get("image"))
        self.open_image_button = self._button(actions, "Abrir imagem", self.open_current_image, "ghost", self.command_icons.get("open"))
        for column, button in enumerate(
            (self.copy_ocr_button, self.copy_prompt_button, self.copy_image_button, self.open_image_button)
        ):
            button.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 8, 0))
            button.configure(state="disabled")

    def _build_history_card(self, parent: tk.Misc) -> None:
        self.history_body = self._card(parent, "Historico de recortes", "Ultimos recortes desta sessao.")
        self.history_list = tk.Frame(self.history_body, bg=COLORS["surface"])
        self.history_list.pack(fill="x")
        self._render_history()

    def _build_system_card(self, parent: tk.Misc) -> None:
        body = self._card(parent, "Status do sistema", "Sinais rapidos para diagnosticar o app.")
        for column in range(2):
            body.grid_columnconfigure(column, weight=1)
        self._status_row(body, "OCR", self.system_ocr_var, 0, 0)
        self._status_row(body, "Captures", self.system_capture_var, 0, 1)
        self._status_row(body, "Atalhos", self.system_hotkey_var, 1, 0)
        self._status_row(body, "Scroll", self.system_scroll_var, 1, 1)
        note = "Sem login salvo, sem controle de conta, sem automacao de site e sem Enter automatico."
        tk.Label(body, text=note, bg=COLORS["surface"], fg=COLORS["muted"], font=FONTS["small"]).grid(
            row=2,
            column=0,
            columnspan=2,
            sticky="w",
            pady=(12, 0),
        )

    def _build_log_card(self, parent: tk.Misc) -> None:
        body = self._card(parent, "Log", "Eventos recentes.")
        self.log_text = tk.Text(
            body,
            height=5,
            wrap="word",
            bg=COLORS["surface_alt"],
            fg=COLORS["muted"],
            relief="flat",
            padx=12,
            pady=10,
            font=FONTS["small"],
        )
        self.log_text.pack(fill="both", expand=True)
        self.log_text.configure(state="disabled")

    def _card(self, parent: tk.Misc, title: str, subtitle: str = "") -> tk.Frame:
        outer = tk.Frame(parent, bg=COLORS["surface"], highlightbackground=COLORS["border"], highlightthickness=1)
        outer.pack(fill="x", pady=(0, 16))
        header = tk.Frame(outer, bg=COLORS["surface"])
        header.pack(fill="x", padx=18, pady=(16, 10))
        tk.Label(header, text=title, bg=COLORS["surface"], fg=COLORS["text"], font=FONTS["card_title"]).pack(anchor="w")
        if subtitle:
            tk.Label(header, text=subtitle, bg=COLORS["surface"], fg=COLORS["muted"], font=FONTS["small"]).pack(
                anchor="w",
                pady=(3, 0),
            )
        body = tk.Frame(outer, bg=COLORS["surface"])
        body.pack(fill="both", expand=True, padx=18, pady=(0, 18))
        return body

    def _field_label(self, parent: tk.Misc, text: str) -> tk.Label:
        return tk.Label(parent, text=text, bg=COLORS["surface"], fg=COLORS["muted"], font=FONTS["body"])

    def _combo(self, parent: tk.Misc, variable: tk.StringVar, values: tuple[str, ...]) -> ttk.Combobox:
        return ttk.Combobox(parent, textvariable=variable, values=values, state="readonly", font=FONTS["body"])

    def _status_row(self, parent: tk.Misc, label: str, value: tk.StringVar, row: int, column: int) -> None:
        frame = tk.Frame(parent, bg=COLORS["surface_alt"])
        frame.grid(row=row, column=column, sticky="ew", padx=(0 if column == 0 else 8, 0), pady=(0, 8))
        tk.Label(frame, text=label, bg=COLORS["surface_alt"], fg=COLORS["muted"], font=FONTS["small"]).pack(
            anchor="w",
            padx=12,
            pady=(10, 2),
        )
        tk.Label(frame, textvariable=value, bg=COLORS["surface_alt"], fg=COLORS["text"], font=FONTS["body"]).pack(
            anchor="w",
            padx=12,
            pady=(0, 10),
        )

    def _build_ai_menu(self, parent: tk.Misc) -> tk.Menubutton:
        selected = self.ai_var.get()
        button = tk.Menubutton(
            parent,
            text=f"  {selected}",
            image=self.ai_icons.get(selected),
            compound="left",
            bg=COLORS["surface_alt"],
            fg=COLORS["text"],
            activebackground=COLORS["teal_soft"],
            activeforeground=COLORS["text"],
            relief="flat",
            borderwidth=0,
            cursor="hand2",
            font=FONTS["button"],
            padx=12,
            pady=8,
            anchor="w",
        )
        menu = tk.Menu(button, tearoff=0, bg=COLORS["surface"], fg=COLORS["text"], activebackground=COLORS["teal_soft"])
        for provider in AI_PROVIDERS:
            menu.add_radiobutton(
                label=f"  {provider.name}",
                image=self.ai_icons.get(provider.name),
                compound="left",
                variable=self.ai_var,
                value=provider.name,
                command=self._on_provider_change,
                font=FONTS["body"],
            )
        button.configure(menu=menu)
        self.ai_menu_button = button
        return button

    def _button(
        self,
        parent: tk.Misc,
        text: str,
        command: Callable[[], None],
        variant: str,
        icon: Optional[ImageTk.PhotoImage] = None,
    ) -> tk.Button:
        palettes = {
            "primary": (COLORS["teal"], "#06213f", "#39cad5"),
            "secondary": (COLORS["navy"], "#ffffff", COLORS["navy_2"]),
            "ghost": (COLORS["surface_alt"], COLORS["text"], COLORS["teal_soft"]),
            "dark": (COLORS["navy_3"], "#ffffff", "#244a80"),
        }
        bg, fg, hover = palettes[variant]
        button = tk.Button(
            parent,
            text=f"  {text}" if icon else text,
            image=icon,
            compound="left" if icon else "none",
            command=command,
            bg=bg,
            fg=fg,
            activebackground=hover,
            activeforeground=fg,
            disabledforeground=COLORS["disabled"],
            borderwidth=0,
            relief="flat",
            cursor="hand2",
            font=FONTS["button"],
            padx=14,
            pady=10,
            anchor="center",
        )

        def on_enter(_event: tk.Event) -> None:
            if str(button["state"]) != "disabled":
                button.configure(bg=hover)

        def on_leave(_event: tk.Event) -> None:
            if str(button["state"]) != "disabled":
                button.configure(bg=bg)

        button.bind("<Enter>", on_enter)
        button.bind("<Leave>", on_leave)
        return button

    def _wire_settings(self) -> None:
        for variable in (
            self.ai_var,
            self.mode_var,
            self.delay_var,
            self.auto_open_var,
            self.auto_copy_var,
            self.auto_paste_var,
            self.save_captures_var,
            self.scroll_speed_var,
        ):
            variable.trace_add("write", lambda *_args: self.save_preferences())

    def _start_hotkeys(self) -> None:
        ok, message = self.hotkey_service.start()
        self.system_hotkey_var.set(message)
        self._log(message)
        if not ok:
            self.set_status("Atalhos globais indisponiveis", "error")

    def enqueue_action(self, action: str) -> None:
        self.action_queue.put(action)

    def _process_actions(self) -> None:
        while not self.action_queue.empty():
            action = self.action_queue.get_nowait()
            if action == "capture":
                self.start_capture()
            elif action == "copy_ocr":
                self.copy_current_ocr()
            elif action == "paste_now":
                self.paste_now()
            elif action == "scroll_down":
                self.start_scroll("down")
            elif action == "scroll_up":
                self.start_scroll("up")
            elif action == "stop_scroll":
                self.stop_scroll()
            elif action == "quit":
                self.close()
                return
        self.root.after(80, self._process_actions)

    def start_capture(self) -> None:
        self.set_status("Aguardando recorte", "working")
        self._log("Aguardando selecao de recorte.")
        try:
            result = self.capture_service.capture_region(self.root, self.save_captures_var.get())
        except Exception as exc:
            self.set_status("Erro ao capturar tela", "error")
            self._log(f"Erro ao capturar tela: {str(exc).splitlines()[0]}")
            return

        if result is None:
            self.set_status("Recorte cancelado", "ready")
            self._log("Recorte cancelado.")
            return

        self.current_result = result
        self._show_pending_capture(result)
        self.set_status("Processando OCR", "working")
        threading.Thread(target=self._run_ocr_worker, args=(result,), daemon=True).start()

    def _run_ocr_worker(self, result: CaptureResult) -> None:
        ocr_result = self.ocr_service.extract_text(result.image_path)
        self.root.after(0, lambda: self._finish_ocr(result, ocr_result))

    def _finish_ocr(self, result: CaptureResult, ocr_result: OCRResult) -> None:
        result.ocr_text = ocr_result.text
        result.ocr_status = ocr_result.status
        result.prompt = self._build_prompt(result, result.ocr_text)
        self.current_result = result
        self._show_capture_result(result)
        self._add_to_history(result)

        if ocr_result.ok:
            self.set_status("OCR concluido", "success")
        else:
            self.set_status("Erro no OCR", "error")
        self._log(result.ocr_status)

        if self.auto_copy_var.get():
            self.copy_selected_content()
        if self.auto_open_var.get():
            self.open_selected_ai()
        if self.auto_paste_var.get():
            self.start_auto_paste()
        beep()

    def _show_pending_capture(self, result: CaptureResult) -> None:
        self.result_title_var.set(result.file_name)
        self.result_meta_var.set("Processando OCR...")
        self._set_capture_buttons("disabled")
        self._load_preview(result.image_path)
        self.ocr_text.configure(state="normal")
        self.ocr_text.delete("1.0", "end")
        self.ocr_text.insert("1.0", "Processando OCR...")
        self.ocr_text.configure(state="disabled")

    def _show_capture_result(self, result: CaptureResult) -> None:
        storage = "captures" if result.saved_to_captures else "temporario"
        self.result_title_var.set(result.file_name)
        self.result_meta_var.set(f"{result.time_label} - {result.ocr_status} - {storage}")
        self._load_preview(result.image_path)
        self.ocr_text.configure(state="normal")
        self.ocr_text.delete("1.0", "end")
        self.ocr_text.insert("1.0", result.ocr_text or result.ocr_status)
        self._set_capture_buttons("normal")

    def _load_preview(self, image_path: Path) -> None:
        try:
            image = Image.open(image_path).convert("RGBA")
            image.thumbnail((210, 150), Image.Resampling.LANCZOS)
            self.preview_photo = ImageTk.PhotoImage(image)
            self.preview_label.configure(image=self.preview_photo, text="")
        except Exception:
            self.preview_label.configure(image="", text="Preview indisponivel")

    def _set_capture_buttons(self, state: str) -> None:
        for button in (self.copy_ocr_button, self.copy_prompt_button, self.copy_image_button, self.open_image_button):
            button.configure(state=state)

    def _build_prompt(self, result: CaptureResult, ocr_text: str) -> str:
        template = self.get_prompt_template()
        text_block = ocr_text.strip() or "[Nenhum texto OCR detectado.]"
        return (
            f"{template}\n\n"
            f"Arquivo do recorte salvo em:\n{result.image_path.resolve()}\n\n"
            f"Texto extraido por OCR:\n{text_block}\n"
        )

    def get_prompt_template(self) -> str:
        return self.prompt_text.get("1.0", "end").strip()

    def get_current_ocr_text(self) -> str:
        if self.current_result is None:
            return ""
        return self.ocr_text.get("1.0", "end").strip()

    def get_current_prompt(self) -> str:
        if self.current_result is None:
            return ""
        prompt = self._build_prompt(self.current_result, self.get_current_ocr_text())
        self.current_result.prompt = prompt
        return prompt

    def copy_selected_content(self) -> None:
        if self.current_result is None:
            self.set_status("Nenhum recorte pronto", "error")
            return
        prompt = self.get_current_prompt()
        ocr_text = self.get_current_ocr_text()
        ok, message = self.clipboard_service.copy_for_mode(
            self.mode_var.get(),
            prompt,
            ocr_text,
            self.current_result.image_path,
        )
        self.set_status("Conteudo copiado" if ok else "Falha ao copiar", "success" if ok else "error")
        self._log(message)

    def copy_current_ocr(self) -> None:
        text = self.get_current_ocr_text()
        ok, message = self.clipboard_service.copy_text(text)
        self.set_status("OCR copiado" if ok else "Nada para copiar", "success" if ok else "error")
        self._log(message)

    def copy_prompt(self) -> None:
        prompt = self.get_current_prompt()
        ok, message = self.clipboard_service.copy_text(prompt)
        self.set_status("Prompt copiado" if ok else "Nada para copiar", "success" if ok else "error")
        self._log(message)

    def copy_image(self) -> None:
        if self.current_result is None:
            self.set_status("Nenhuma imagem pronta", "error")
            return
        ok, message = self.clipboard_service.copy_image(self.current_result.image_path)
        self.set_status("Imagem copiada" if ok else "Falha ao copiar imagem", "success" if ok else "error")
        self._log(message)

    def open_current_image(self) -> None:
        if self.current_result is None:
            self.set_status("Nenhuma imagem pronta", "error")
            return
        self._open_image_path(self.current_result.image_path)

    def open_selected_ai(self) -> None:
        provider = PROVIDERS_BY_NAME.get(self.ai_var.get(), PROVIDERS_BY_NAME[DEFAULT_PROVIDER])
        ok, message = self.browser_service.open_url(provider.url)
        self.set_status(f"{provider.name} aberto" if ok else "Falha ao abrir IA", "success" if ok else "error")
        self._log(message)

    def send_to_chatgpt(self) -> None:
        self.ai_var.set("ChatGPT")
        self._on_provider_change()
        if self.current_result is not None:
            self.copy_prompt()
        provider = PROVIDERS_BY_NAME["ChatGPT"]
        ok, message = self.browser_service.open_url(provider.url)
        self.set_status("ChatGPT aberto; revise antes de enviar" if ok else "Falha ao abrir ChatGPT", "success" if ok else "error")
        self._log(message)

    def paste_now(self) -> None:
        if self.current_result is not None:
            self.copy_selected_content()
        paste_hotkey()
        self.set_status("Ctrl+V enviado", "success")
        self._log("Colagem solicitada. O app nao envia Enter.")

    def start_auto_paste(self) -> None:
        try:
            delay = max(1, int(self.delay_var.get()))
        except ValueError:
            delay = 5
        mode = self.mode_var.get()
        self.set_status(f"Auto-colar em {delay}s", "working")
        self._log(f"Auto-colar {mode} em {delay}s. Clique no campo da IA.")
        self.root.after(500, self.root.iconify)
        self.root.after(delay * 1000, lambda: self._perform_paste_sequence(mode))

    def _perform_paste_sequence(self, mode: str) -> None:
        if self.current_result is None:
            return
        if mode == "Prompt + imagem":
            ok, message = self.clipboard_service.copy_image(self.current_result.image_path)
            self._log(message)
            if ok:
                paste_hotkey()
                self.root.after(900, self._paste_prompt_after_image)
            return

        self.copy_selected_content()
        paste_hotkey()
        self.set_status("Conteudo colado", "success")
        self._log("Ctrl+V enviado. Revise antes de enviar.")

    def _paste_prompt_after_image(self) -> None:
        prompt = self.get_current_prompt()
        self.clipboard_service.copy_text(prompt)
        paste_hotkey()
        self.set_status("Imagem e prompt colados", "success")
        self._log("Imagem e prompt colados. O app nao envia Enter.")

    def start_scroll(self, direction: str) -> None:
        self.save_preferences()
        self.scroll_service.start(direction, self.settings.scroll_speed)
        label = "baixo" if direction == "down" else "cima"
        self.system_scroll_var.set(f"Ativo para {label}")
        self.set_status(f"Scroll ativo para {label}", "scroll")

    def stop_scroll(self) -> None:
        self.scroll_service.stop()
        self.system_scroll_var.set("Parado")
        self.set_status("Scroll parado", "ready")

    def _handle_scroll_status(self, message: str) -> None:
        self._log(message)

    def _add_to_history(self, result: CaptureResult) -> None:
        self.history.insert(0, result)
        self.history = self.history[: self.settings.history_limit]
        self._render_history()

    def _render_history(self) -> None:
        for child in self.history_list.winfo_children():
            child.destroy()
        if not self.history:
            tk.Label(
                self.history_list,
                text="Nenhum recorte nesta sessao ainda.",
                bg=COLORS["surface"],
                fg=COLORS["muted"],
                font=FONTS["body"],
            ).pack(anchor="w")
            return

        for result in self.history:
            row = tk.Frame(self.history_list, bg=COLORS["surface_alt"])
            row.pack(fill="x", pady=(0, 8))
            row.grid_columnconfigure(0, weight=1)
            text = f"{result.time_label}  {result.file_name}"
            tk.Label(row, text=text, bg=COLORS["surface_alt"], fg=COLORS["text"], font=FONTS["body"]).grid(
                row=0,
                column=0,
                sticky="w",
                padx=12,
                pady=(9, 2),
            )
            tk.Label(row, text=result.ocr_status, bg=COLORS["surface_alt"], fg=COLORS["muted"], font=FONTS["small"]).grid(
                row=1,
                column=0,
                sticky="w",
                padx=12,
                pady=(0, 9),
            )
            self._button(
                row,
                "Copiar texto",
                lambda item=result: self.copy_history_ocr(item),
                "ghost",
                self.command_icons.get("text"),
            ).grid(row=0, column=1, rowspan=2, sticky="e", padx=(8, 0), pady=8)
            self._button(
                row,
                "Abrir imagem",
                lambda item=result: self._open_image_path(item.image_path),
                "ghost",
                self.command_icons.get("open"),
            ).grid(row=0, column=2, rowspan=2, sticky="e", padx=8, pady=8)

    def copy_history_ocr(self, result: CaptureResult) -> None:
        ok, message = self.clipboard_service.copy_text(result.ocr_text)
        self.set_status("Texto do historico copiado" if ok else "Historico sem texto", "success" if ok else "error")
        self._log(message)

    def _open_image_path(self, path: Path) -> None:
        try:
            if os.name == "nt":
                os.startfile(path)  # type: ignore[attr-defined]
            else:
                self.browser_service.open_url(path.resolve().as_uri())
        except Exception as exc:
            self.set_status("Falha ao abrir imagem", "error")
            self._log(f"Falha ao abrir imagem: {str(exc).splitlines()[0]}")
            return
        self.set_status("Imagem aberta", "success")

    def _on_provider_change(self) -> None:
        selected = self.ai_var.get()
        if hasattr(self, "ai_menu_button"):
            self.ai_menu_button.configure(text=f"  {selected}", image=self.ai_icons.get(selected))
        self.save_preferences()

    def _on_scroll_speed_change(self, value: str) -> None:
        try:
            speed = int(float(value))
        except ValueError:
            speed = self.settings.scroll_speed
        self.speed_label_var.set(f"{speed}/10")
        if self._settings_ready:
            self.save_preferences()

    def save_preferences(self) -> None:
        if not self._settings_ready:
            return
        self.settings.ai_provider = self.ai_var.get()
        self.settings.paste_mode = self.mode_var.get()
        try:
            self.settings.paste_delay_seconds = int(self.delay_var.get())
        except ValueError:
            self.settings.paste_delay_seconds = 5
        self.settings.auto_open_after_capture = bool(self.auto_open_var.get())
        self.settings.auto_copy_after_capture = bool(self.auto_copy_var.get())
        self.settings.auto_paste_after_delay = bool(self.auto_paste_var.get())
        self.settings.save_captures = bool(self.save_captures_var.get())
        self.settings.scroll_speed = int(self.scroll_speed_var.get())
        self.settings.prompt_template = self.get_prompt_template()
        try:
            save_settings(self.settings)
        except OSError as exc:
            self._log(f"Nao foi possivel salvar preferencias: {str(exc).splitlines()[0]}")

    def set_status(self, message: str, kind: str = "ready") -> None:
        self.status_text_var.set(message)
        color = STATUS_COLORS.get(kind, COLORS["teal"])
        if hasattr(self, "status_dot"):
            self.status_dot.itemconfigure(self.status_dot_id, fill=color)

    def _log(self, message: str) -> None:
        if not hasattr(self, "log_text"):
            return
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"{message}\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def close(self) -> None:
        self.save_preferences()
        self.scroll_service.stop()
        self.hotkey_service.stop()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def run_app() -> None:
    root = tk.Tk()
    app = OlheiroApp(root)
    app.run()
