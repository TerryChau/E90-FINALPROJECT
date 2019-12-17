const aws = require('aws-sdk');
const express = require('express');  // web framework
const exphbs = require('express-handlebars'); // view engine
const multer = require('multer');  // middleware for uploading of multipart/form
const multerS3 = require('multer-s3');  // storage engine for S3

const config = require('./config.json');  // AWS settings are placed here

aws.config.update({
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        accessKeyId: config.AWS_ACCESS_KEY,
        region: config.AWS_REGION
});

const app = express();
const s3 = new aws.S3();

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

var newFileName;  // variable for temporary storage of the uploaded filename

// The following are helper functions to assist with parsing of text/addresses.
function removeExtension(fileName){
    return fileName.substring(0, fileName.lastIndexOf("."));
}
function addTime(fileName){
    newFileName = removeExtension(fileName) + Date.now() + fileName.substring(fileName.lastIndexOf("."));
    return newFileName;
}
function mp4Key(fileName){
    return removeExtension(fileName)+"/job/MP4/"+fileName;
}
function thumbnailKey(fileName){
    return removeExtension(fileName)+"/job/Thumbnails/"+removeExtension(fileName)+".0000001.jpg";
}
function objectURL(key){
    return "https://"+config.AWS_BUCKET_MEDIA+".s3.amazonaws.com/"+key;
}

const upload = multer({
    // set the storage location to point to the S3 watch bucket
    storage: multerS3({
        s3: s3,
        acl: 'public-read',
        bucket: config.AWS_BUCKET_WATCH+'/inputs',
        key: function (req, file, cb) {
            console.log(file);
            cb(null, addTime(file.originalname));
        }
    }),
    // force file format to be video only
    fileFilter: function (req, file, callback) {
        if(file.mimetype.split('/')[0]!='video'){
            return callback(new Error('Only images are allowed'))
        }
        callback(null, true)
    },
    // set file size to 25 MB maximum
    limits: {
        fileSize: 1024 * 1024 * 25
    },
});

// HTTP GET method to /download/ view
app.get('/download/', function(req, res) {
    var passedVariable = req.query.file;
    // Corresponding values for files on AWS are added to the download view
    res.render('download',{
        thumbnail: objectURL(thumbnailKey(passedVariable)),
        filename: passedVariable,
        video: objectURL(mp4Key(passedVariable))
    });
});

// HTTP GET method to main view
app.get('/', function(req, res) {
    res.render("empty");
});

// HTTP GET method to /failure view
app.get('/failure', function(req, res) {
    res.render("failure");
});

// HTTP POST method to /uploadToAWS directory
app.post('/uploadToAWS', upload.array('videoFile',1), (req, res, next) => {
    // newFileName set by multer; if multer is not called, then return home
    if (newFileName == ""){
        res.redirect("/");
        return next();
    }
    else{
        // Delay redirect to /download/ until AWS reports that objects exists
        const paramsMP4 = {
            Bucket: config.AWS_BUCKET_MEDIA,
            Key: mp4Key(newFileName)
        };
        const paramsThumbnail = {
            Bucket: config.AWS_BUCKET_MEDIA,
            Key: thumbnailKey(newFileName)
        };
        // Checking for existance of MP4
        s3.waitFor('objectExists', paramsMP4, function(err, data) {
            if (err){
                console.log(err, err.stack); // an error occurred
                res.redirect("/failure");
                newFileName == "";
            }
            else {
                console.log(data);           // successful response
                // Check for existance of Thumbnail
                s3.waitFor('objectExists', paramsThumbnail, function(err, data) {
                    if (err){
                        console.log(err, err.stack); // an error occurred
                        res.redirect("/failure");
                        newFileName == "";
                    }
                    else {
                        console.log(data);           // successful response
                        res.redirect("/download/?file=" + newFileName);
                        newFileName == "";
                    }
                });

            }
        });
    }
});

app.use(express.static('./public')); //Serves resources from public folder

const server = app.listen(80, function(){
    // The server object listens on port 80
    console.log("server start at port 80"); 
});

