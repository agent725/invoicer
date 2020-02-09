#!/bin/sh
echo "Installing Invoicer dependecies..." 
sudo apt install nodejs-legacy pandoc wkhtmltopdf
mkdir -p ~/.local/bin > /dev/null
ln -s "`realpath invoice`" ~/.local/bin/invoice && chmod +x invoice
echo "Done!"

