# README.md

## Enhancement Application

This project is an image enhancement application that utilizes two algorithms: Histogram Equalization (HE) and Contrast Limited Adaptive Histogram Equalization (CLAHE). The application allows users to upload images or PDF files, apply enhancements, and download the results.

### Algorithms Used

1. **Histogram Equalization (HE)**:
   - This algorithm improves the contrast of an image by effectively spreading out the most frequent intensity values. It works by calculating the histogram of the pixel intensities and then using this histogram to redistribute the intensity values.

2. **Contrast Limited Adaptive Histogram Equalization (CLAHE)**:
   - CLAHE is an advanced version of HE that operates on small regions (tiles) of the image. It limits the contrast amplification to avoid over-amplification of noise. This method enhances local contrast and is particularly useful for images with varying lighting conditions.

### How the Project Works

1. **File Upload**:
   - Users can upload an image or a PDF file. The application supports drag-and-drop functionality as well as file input.

2. **Image Processing**:
   - Upon uploading, the application reads the file and displays the original image on the canvas.
   - Users can select the enhancement mode (HE or CLAHE) and adjust parameters such as tile size, clip limit, and strength.

3. **Applying Enhancements**:
   - When the user clicks the "Equalize" button, the selected algorithm is applied to the image:
     - For HE, the histogram of the image is calculated, and the pixel values are redistributed based on the cumulative distribution function (CDF).
     - For CLAHE, the image is divided into tiles, and histogram equalization is applied to each tile with a specified clip limit to control contrast.

4. **Displaying Results**:
   - The enhanced image is displayed on a separate canvas. Users can compare the original and enhanced images.

5. **Download Options**:
   - Users can download the enhanced image as a PNG file or save it to the server.

### Getting Started

To run the application, open the `index.html` file in a web browser. Ensure that you have a local server running if you are using features that require server-side processing.

### Conclusion

This enhancement application provides a user-friendly interface for applying advanced image processing techniques, making it easier to improve image quality for various applications.