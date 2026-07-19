# Certificate Template Change Guide

This guide explains how to completely replace the background certificate template and adjust the text coordinates so that the names and competition titles line up perfectly with your new design.

## 1. Replace the Image Files

1. Obtain your new certificate design as a `.jpg` or `.png` file.
2. Ensure the image is in **Landscape** orientation (a common size is 2000px wide by 1414px high).
3. Navigate to the `public/` directory in your project folder.
4. Delete the old `certificate_1.jpg` and `certificate_2.jpg` files.
5. Paste your new certificate design into the `public/` folder.
6. Rename your new file to `certificate_1.jpg`. (If you have a separate design for 2nd/3rd place, rename that one `certificate_2.jpg`. If you only have one design, just duplicate the file and name it `certificate_2.jpg`).

## 2. Update Default Coordinates in Code

Because the blank dotted lines on your new template will likely be in a different physical location than the old template, you must update the default X (Horizontal) and Y (Vertical) starting coordinates in the code.

1. Open the file: `src/components/CertificateGenerator.tsx`
2. Scroll to approximately line 20 where you see `// Customization state`
3. You will see four numbers that look like this:
   ```javascript
   const [nameX, setNameX] = useState(-140);
   const [nameY, setNameY] = useState(415);
   const [compX, setCompX] = useState(-50);
   const [compY, setCompY] = useState(490);
   ```
4. **How it works:**
   - `nameY` controls how far down the page the Participant's Name sits. A higher number moves it further down.
   - `compY` controls how far down the page the Competition Name sits.
   - `nameX` and `compX` control the horizontal shifting. `0` is perfectly centered. A negative number (e.g. `-100`) shifts the text to the Left. A positive number (e.g. `100`) shifts the text to the Right.
5. **How to calibrate for your new template:**
   - Change `nameY` and `compY` to your best guess.
   - Save the file and open the Certificate Generator on your local server.
   - Look at where the text lands. Use the Sliders on the screen to perfectly align the text onto the new dotted lines.
   - Look at the new numbers on your Sliders! Go back into the code and replace the `useState` numbers with those exact numbers.
6. Save the file. Now, every time you open a certificate, it will automatically default to those perfect coordinates!

## 3. Adjusting Font Colors (Optional)

If your new certificate template is dark, you might want white text instead of the default dark slate text.

1. In the same `CertificateGenerator.tsx` file, scroll down to the `drawCertificate` function (around line 50).
2. Look for `ctx.fillStyle = '#1e293b';` (This is the dark slate color).
3. You can change this hex code to any color you want!
   - For White text: `ctx.fillStyle = '#ffffff';`
   - For Red text: `ctx.fillStyle = '#dc2626';`
   - For Gold text: `ctx.fillStyle = '#ca8a04';`

## 4. Push to GitHub

Once you are happy with the template and the new default coordinates, you can push the changes live:
```bash
git add .
git commit -m "Update certificate template and coordinates"
git push
```
Vercel will automatically deploy your new templates!