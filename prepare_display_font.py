"""OFL derivative: retain Archivo Black metrics, round i tittle and period."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
root=Path(__file__).resolve().parent
font=TTFont(root/'fonts/ArchivoBlack.ttf');cmap=font.getBestCmap()
def circle(pen,x0,y0,x1,y1):
    cx=(x0+x1)/2;cy=(y0+y1)/2;rx=(x1-x0)/2;ry=(y1-y0)/2;k=.4142135623730951
    pen.moveTo((cx-rx,cy))
    pen.qCurveTo((cx-rx,cy+ry*k),(cx-rx*k,cy+ry),(cx,cy+ry))
    pen.qCurveTo((cx+rx*k,cy+ry),(cx+rx,cy+ry*k),(cx+rx,cy))
    pen.qCurveTo((cx+rx,cy-ry*k),(cx+rx*k,cy-ry),(cx,cy-ry))
    pen.qCurveTo((cx-rx*k,cy-ry),(cx-rx,cy-ry*k),(cx-rx,cy))
    pen.closePath()
for char in ['i','.']:
    name=cmap[ord(char)];record=RecordingPen();font.getGlyphSet()[name].draw(record);pen=TTGlyphPen(None)
    if char=='i':
        # Dot center and width retained; round shape expands vertically above cap.
        circle(pen,67,558,266,757)
        for op,args in record.value[5:]:getattr(pen,op)(*args)
    else:circle(pen,67,0,266,199)
    font['glyf'][name]=pen.glyph()
for entry in font['name'].names:
    value={1:'SoundRig Display',2:'Regular',3:'SoundRig Display 1.0',4:'SoundRig Display',6:'SoundRigDisplay-Regular',16:'SoundRig Display',17:'Regular'}.get(entry.nameID)
    if value:entry.string=value.encode(entry.getEncoding())
font.save(root/'fonts/SoundRigDisplay.ttf')
print('Wrote OFL derivative SoundRigDisplay.ttf')
