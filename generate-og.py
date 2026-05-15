from PIL import Image, ImageDraw, ImageFont, ImageOps
import os

def find_font(bold=True):
    """Find a suitable system font on macOS."""
    candidates = [
        # SF Pro (macOS default)
        "/System/Library/Fonts/SFNSText-Bold.otf" if bold else "/System/Library/Fonts/SFNSText-Regular.otf",
        "/System/Library/Fonts/SFNS.ttf",
        # Helvetica Neue
        "/System/Library/Fonts/HelveticaNeue-Bold.otf" if bold else "/System/Library/Fonts/HelveticaNeue-Medium.otf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        # Helvetica
        "/System/Library/Fonts/Helvetica.ttc",
        # Arial fallback
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def create_og_image():
    # --- Configuration ---
    WIDTH, HEIGHT = 1200, 630
    BACKGROUND_COLOR = (255, 255, 255)
    DOT_COLOR = (220, 220, 220)
    TEXT_COLOR = (20, 20, 20)
    SUBTEXT_COLOR = (80, 80, 80)

    AVATAR_PATH = os.path.join(os.path.dirname(__file__), "public", "images", "avatar.jpeg")

    # Create the canvas
    img = Image.new('RGB', (WIDTH, HEIGHT), color=BACKGROUND_COLOR)
    draw = ImageDraw.Draw(img)

    # --- 1. Draw the Dot Grid Pattern ---
    dot_radius = 2
    spacing = 40

    for x in range(0, WIDTH, spacing):
        for y in range(0, HEIGHT, spacing):
            left_up_point = (x - dot_radius, y - dot_radius)
            right_down_point = (x + dot_radius, y + dot_radius)
            draw.ellipse([left_up_point, right_down_point], fill=DOT_COLOR)

    # --- 2. Load Resources ---
    bold_path = find_font(bold=True)
    medium_path = find_font(bold=False)

    if bold_path:
        font_main = ImageFont.truetype(bold_path, 80)
        font_sub = ImageFont.truetype(medium_path or bold_path, 45)
        print(f"Using font: {bold_path}")
    else:
        print("No system font found, using Pillow default.")
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Process Avatar
    avatar_size = 180
    try:
        avatar = Image.open(AVATAR_PATH).convert("RGBA")
        avatar = avatar.resize((avatar_size, avatar_size), Image.Resampling.LANCZOS)

        # Create circular mask
        mask = Image.new("L", (avatar_size, avatar_size), 0)
        draw_mask = ImageDraw.Draw(mask)
        draw_mask.ellipse((0, 0, avatar_size, avatar_size), fill=255)

        avatar_circular = ImageOps.fit(avatar, mask.size, centering=(0.5, 0.5))
        avatar_circular.putalpha(mask)
        print(f"Loaded avatar from: {AVATAR_PATH}")
    except IOError:
        print(f"Avatar not found at {AVATAR_PATH}. Creating placeholder.")
        avatar_circular = Image.new('RGBA', (avatar_size, avatar_size), (200, 200, 200))
        d = ImageDraw.Draw(avatar_circular)
        d.ellipse((0, 0, avatar_size, avatar_size), fill=(100, 100, 100))

    # --- 3. Calculate Layout ---
    main_text = "Hi, I'm Johnathan Mo"
    sub_text = "swe + creator + builder"

    bbox_main = font_main.getbbox(main_text)
    w_main = bbox_main[2] - bbox_main[0]
    h_main = bbox_main[3] - bbox_main[1]

    bbox_sub = font_sub.getbbox(sub_text)
    w_sub = bbox_sub[2] - bbox_sub[0]
    h_sub = bbox_sub[3] - bbox_sub[1]

    gap_avatar_text = 40
    gap_lines = 30

    top_line_width = avatar_size + gap_avatar_text + w_main
    start_x = (WIDTH - top_line_width) // 2

    total_content_height = avatar_size + gap_lines + h_sub
    start_y = (HEIGHT - total_content_height) // 2

    # --- 4. Draw Elements ---
    img.paste(avatar_circular, (int(start_x), int(start_y)), avatar_circular)

    text_y_center = start_y + (avatar_size // 2) - (h_main // 2) - 10
    draw.text((start_x + avatar_size + gap_avatar_text, text_y_center),
              main_text, font=font_main, fill=TEXT_COLOR)

    sub_x = (WIDTH - w_sub) // 2
    sub_y = start_y + avatar_size + gap_lines
    draw.text((sub_x, sub_y), sub_text, font=font_sub, fill=SUBTEXT_COLOR)

    # --- 5. Save to app/ directory for Next.js ---
    output_path = os.path.join(os.path.dirname(__file__), "app", "opengraph-image.png")
    img.save(output_path)
    print(f"OG image saved to: {output_path}")

if __name__ == "__main__":
    create_og_image()
