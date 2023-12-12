# Use the base image with Node.js installed via NVM
FROM anodimous/ubuntu-container:20.04

# Set environment variables

# Set the working directory
WORKDIR /home/app/doraymon

# Copy the application files into the container
COPY . /home/app/doraymon

# Install cron and other dependencies if needed
# (Adjust this according to your application's dependencies)

# Source NVM
RUN cd /home/app/doraymon /root/.nvm/versions/node/v18.16.0/lib/node_modules/npm install

# Expose necessary ports
EXPOSE 3000 80

# Command to start the application
CMD ["sh", "-c", "cron"]
