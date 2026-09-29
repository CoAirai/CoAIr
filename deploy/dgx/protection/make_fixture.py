"""Create an image-only PDF, ensuring the acceptance test exercises OCR."""
import argparse
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument('--font', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
im = Image.new('RGB', (1654, 2339), 'white')
draw = ImageDraw.Draw(im)
font = ImageFont.truetype(a.font, 30)
lines = [
    'FICTIONAL DEVICE ACCEPTANCE RECORD', 'Not Edinburgh project evidence.',
    'Date: 20 September 2010', '', 'South Wharf inspection record', '',
    'On 12 April 2007, Alice Morgan approved', 'the South Wharf cable inspection.', '',
    'On 14 April 2007, Robert Hayes completed', 'the South Wharf cable inspection.',
    'No defects were found.', '', 'This record was prepared on 20 September 2010',
    'to describe those earlier events.',
]
for index, line in enumerate(lines):
    draw.text((110, 140 + index * 65), line, font=font, fill='black')
im.save(a.output, 'PDF', resolution=200)
