const { Router } = require('express');
const router = Router();
const multipart = require('connect-multiparty');
const multipartMiddleware = multipart({ uploadDir: './uploads' });
const { uploadImage } = require('../s3')
var CryptoJS = require("crypto-js");
var util = require('util');
const fs = require('fs');
const unlinkFile = util.promisify(fs.unlink)
const multer = require('multer')
const upload = multer({ dest: './uploads' })
const mysql = require('mysql2');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
const aws_keys = require('../creds')
var AWS = require('aws-sdk');
const s3 = new AWS.S3(aws_keys.s3);
var needle = require('needle');


//instanciamos los servicios a utilizar con sus respectivos accesos.
const cognito = new AmazonCognitoIdentity.CognitoUserPool(aws_keys.cognito);
const rek = new AWS.Rekognition(aws_keys.rekognition);
const translate = new AWS.Translate(aws_keys.translate);

const connection = mysql.createConnection({
    host: '3.19.70.184',
    user: 'root',
    port: '33060',
    password: 'Nelly_2021',
    database: 'semi1p2'
});


router.get("/getUsers", (request, response) => {

    connection.query('SELECT * FROM usuario2', (err,rows) => {
      if(err) throw err;

      response.json({data:rows})

    });
})

router.post('/uploadImage', upload.single('file'), async (req, res) => {
    const file = req.file
    console.log(file)

    // apply filter
    // resize 

    const result = await uploadImage(file)
    await unlinkFile(file.path)
    console.log(result)
    const description = req.body.description
    res.json({
        'msg': file.filename
    });
})
//SubirImagenCrearPublicacion Retorno Etiqueteas
router.post('/uploadImagePubli', upload.single('file'), async (req, res) => {
    const file = req.file
    const result = await uploadImage(file)
    await unlinkFile(file.path)

    var params = {
        Image: {
            S3Object: {
                Bucket: "grupo7-bucket",
                Name: file.filename.toString()
            },
        },
        MaxLabels: 123
    };

    rek.detectLabels(params, function (err, data) {
        if (err) { res.json({ error: true, mensaje: err.message }) }
        else {
            let etiquetas = [];
            data.Labels.forEach(function (elemento, indice, array) {
                etiquetas.push(elemento.Name);
            })
            console.log(etiquetas);
            res.json({ error: false, msg: file.filename, labels: etiquetas });
        }
    });
    /*res.json({
        'msg': file.filename
    });*/
})

router.post('/uploadWebCamImage', async (req, res) => {

    let ts = Date.now();
    var id = req.body.id + ts;
    console.log(id);
    var foto = req.body.foto;
    //carpeta y nombre que quieran darle a la imagen
    var nombrei = id + ".jpg";
    //se convierte la base64 a bytes
    let buff = new Buffer.from(foto, 'base64');

    const params = {
        Bucket: "grupo7-bucket",
        Key: nombrei,
        Body: buff,
        ContentType: "image",
        ACL: 'public-read'
    };
    const putResult = s3.putObject(params).promise();
    res.json({ 'msg': nombrei })



});

//Guardar Usuario
router.post('/addUser', async (req, res) => {
    const { nombre_usuario, usuario_usuario, pw_usuario, correo_usuario, foto_usuario, estado_usuario } = req.body;
    var crypto = require('crypto');
    var hash = crypto.createHash('sha256').update(pw_usuario).digest('hex');
    var attributelist = [];

    var dataname = {
        Name: 'custom:nombre',
        Value: nombre_usuario,
    };
    var attributename = new AmazonCognitoIdentity.CognitoUserAttribute(dataname);

    var datauser = {
        Name: 'custom:usuario',
        Value: usuario_usuario,
    };
    var attributeuser = new AmazonCognitoIdentity.CognitoUserAttribute(datauser);

    attributelist.push(attributeuser);

    var datapass = {
        Name: 'custom:pass',
        Value: hash + "D**",
    };
    var attributepw = new AmazonCognitoIdentity.CognitoUserAttribute(datapass);

    attributelist.push(attributepw);

    var dataemail = {
        Name: 'email',
        Value: correo_usuario,
    };
    var attributeemail = new AmazonCognitoIdentity.CognitoUserAttribute(dataemail);

    attributelist.push(attributeemail);

    var datapicture = {
        Name: 'custom:foto',
        Value: foto_usuario,
    };
    var attributepicture = new AmazonCognitoIdentity.CognitoUserAttribute(datapicture);

    attributelist.push(attributepicture);

    var dataestado = {
        Name: 'custom:estado',
        Value: estado_usuario,
    };
    var attributeestado = new AmazonCognitoIdentity.CognitoUserAttribute(dataestado);

    attributelist.push(attributeestado);


    console.log(attributelist);

    cognito.signUp(usuario_usuario, hash + "D**", attributelist, null, async (err, data) => {

        if (err) {
            console.log(err);

            res.status(200).json({ error: true, msg: err.message })
            return;
        }
        console.log(data);
        //Guardar usaurio en la bd
        connection.query('insert into USUARIO (Nombre,Usuario,Pass,Correo,Foto,Estado)values(?,?,?,?,?,?)', [nombre_usuario, usuario_usuario, hash + "D**", correo_usuario, foto_usuario, estado_usuario], (err, rows) => {
            if (err) throw err;

            res.status(200).json({ error: false, msg: 'Usuario insertado correctamente' })

        });
    });
});

//Login
router.post('/login', async (req, res) => {
    console.log(req.body);
    var crypto = require('crypto');
    var hash = crypto.createHash('sha256').update(req.body.pw_usuario).digest('hex')
    var authenticationData = {
        Username: req.body.usuario_usuario,
        Password: hash + "D**"
    };
    var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
        authenticationData
    );
    var userData = {
        Username: req.body.usuario_usuario,
        Pool: cognito,
    };
    var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
    cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH');

    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function (result) {
            // User authentication was successful
            connection.query("select id_usuario,Nombre,Usuario, Foto from USUARIO where Usuario = ?", [req.body.usuario_usuario], (err, rows) => {
                if (err) throw err;
                if (rows.length == 0) { //Usuario no esta registrado
                    res.status(200).json({ error: true, msg: 'El usuario no esta registrado' })
                } else {

                    res.status(200).json(
                        {
                            error: false,
                            DataUser: {
                                "id_usuario": rows[0].id_usuario,
                                "nombre_usuario": rows[0].Nombre,
                                "usuario": rows[0].Usuario,
                                "foto_usuario": rows[0].Foto

                            }

                        }
                    );
                }
            });
        },
        onFailure: function (err) {
            // User authentication was not successful
            console.log(err.message);
            res.status(200).json({ error: true, msg: err.message })
        },

    });

});

//Login Reconocimiento
router.post('/login/reconocimiento', async (req, res) => {
    var strFotoUsuario = "";
    connection.query("select id_usuario,Nombre,Usuario, Foto from USUARIO where Usuario = ?", [req.body.usuario_usuario], (err, rows) => {
        if (err) throw err;
        if (rows.length == 0) { //Usuario no esta registrado
            res.status(200).json({ error: true, msg: 'El usuario no esta registrado' })
        } else {
            strFotoUsuario = rows[0].Foto
            needle('post', 'https://m0q6f7kvvk.execute-api.us-east-2.amazonaws.com/compare/compare', { imagen1: strFotoUsuario.toString(), imagen2: req.body.imagen.toString() }, { json: true })
                .then(function (response) {
                    if (!response.body.error) {
                        if (response.body.similarity >= 80) {
                            res.status(200).json(
                                {
                                    error: false,
                                    DataUser: {
                                        "id_usuario": rows[0].id_usuario,
                                        "nombre_usuario": rows[0].Nombre,
                                        "usuario": rows[0].Usuario,
                                        "foto_usuario": rows[0].Foto

                                    }

                                }
                            );
                        } else {
                            res.status(200).json({ error: true, msg: 'La imagen no coincide con la foto guardada' })
                        }
                    } else {
                        res.status(200).json({ error: true, msg: response.body.msg.message.toString() })
                    }

                })
                .catch(function (err) {
                    res.status(200).json({ error: true, msg: err })
                })
        }
    });


});

router.post('/detectaretiquetas', function (req, res) {
    var imagen = req.body.imagen;
    var params = {
        /* S3Object: {
          Bucket: "mybucket", 
          Name: "mysourceimage"
        }*/
        Image: {
            Bytes: Buffer.from(imagen, 'base64')
        },
        MaxLabels: 123
    };
    rek.detectLabels(params, function (err, data) {
        if (err) { res.json({ mensaje: "Error" }) }
        else {
            res.json({ texto: data.Labels });
        }
    });
});

//UpdateUser
router.post('/updateUser', function (req, res) {
    console.log(req.body);
    var crypto = require('crypto');
    var hash = crypto.createHash('sha256').update(req.body.pw_usuario).digest('hex')
    var authenticationData = {
        Username: req.body.usuario_usuario,
        Password: hash + "D**"
    };
    var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
        authenticationData
    );
    var userData = {
        Username: req.body.usuario_usuario,
        Pool: cognito,
    };
    var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
    cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH');

    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function (result) {
            //cognito User
            var attributeList = [];
            var attribute = {
                Name: 'custom:nombre',
                Value: req.body.nombre_usuario,
            };
            var attribute = new AmazonCognitoIdentity.CognitoUserAttribute(attribute);
            var attribute2 = {
                Name: 'custom:foto',
                Value: req.body.foto_usuario,
            };
            var attribute2 = new AmazonCognitoIdentity.CognitoUserAttribute(attribute2);
            attributeList.push(attribute2);

            cognitoUser.updateAttributes(attributeList, function (err, result) {
                if (err) {
                    alert(err.message || JSON.stringify(err));
                    return;
                }
                console.log('call result: ' + result);
            });
            // User authentication was successful
            connection.query("update USUARIO set Nombre=?, Foto = ? where Usuario = ?", [req.body.nombre_usuario, req.body.foto_usuario, req.body.usuario_usuario], (err, rows) => {
                if (err) throw err;
                connection.query("select id_usuario,Nombre,Usuario, Foto from USUARIO where Usuario = ?", [req.body.usuario_usuario], (err, rows) => {
                    if (err) throw err;
                    if (rows.length == 0) { //Usuario no esta registrado
                        res.status(200).json({ error: true, msg: 'El usuario no esta registrado' })
                    } else {

                        res.status(200).json(
                            {
                                error: false,
                                DataUser: {
                                    "id_usuario": rows[0].id_usuario,
                                    "nombre_usuario": rows[0].Nombre,
                                    "usuario": rows[0].Usuario,
                                    "foto_usuario": rows[0].Foto

                                }

                            }
                        );
                    }
                });
            });

        },
        onFailure: function (err) {
            // User authentication was not successful
            res.status(200).json({ error: true, msg: "contrasena incorrecta!" })
        },

    });

});

//Crear Publicacion
router.post('/crearPublicacion', function (req, res) {
    var fechaPublicacion = new Date();
    const { imagen_publicacion, contenido_publicaicon, id_usuario_publicacion, labels_publicacion } = req.body;
    connection.query('insert into PUBLICACION (fecha,imagen,contenido,USUARIO_id_usuario)values(?,?,?,?)', [fechaPublicacion, imagen_publicacion, contenido_publicaicon, id_usuario_publicacion], (err, rows) => {
        if (err) throw err;
        connection.query('SELECT id_publicacion FROM PUBLICACION WHERE id_publicacion = LAST_INSERT_ID()', [], (err, rows) => {
            if (err) throw err;
            if (rows.length == 0) { //Usuario no esta registrado
                res.status(200).json({ error: true, msg: 'El usuario no esta registrado' })
            } else {
                var id_publicacion = rows[0].id_publicacion;
                labels_publicacion.forEach(function (elemento, indice, array) {
                    connection.query('SELECT id_etiqueta,Nombre FROM Etiqueta WHERE Nombre = ?', [elemento.toString()], (err, rows) => {
                        if (err) throw err;
                        var id_etiqueta;
                        if (rows.length == 0) { //Usuario no esta registrado
                            connection.query('insert into Etiqueta (Nombre)values(?)', [elemento.toString()], (err, rows) => {
                                if (err) throw err;
                                connection.query('SELECT id_etiqueta FROM Etiqueta WHERE Nombre = ?', [elemento.toString()], (err, rows) => {
                                    if (err) throw err;
                                    id_etiqueta = rows[0].id_etiqueta;
                                    connection.query('insert into Publicacion_Etiqueta (id_publicacion,id_etiqueta)values(?,?)', [id_publicacion, id_etiqueta], (err, rows) => {
                                        if (err) throw err;
                                    });
                                });
                            });
                        } else {
                            //hacer insert en la etiqueta
                            id_etiqueta = rows[0].id_etiqueta;
                            connection.query('insert into Publicacion_Etiqueta (id_publicacion,id_etiqueta)values(?,?)', [id_publicacion, id_etiqueta], (err, rows) => {
                                if (err) throw err;
                            });
                        }

                    });
                })
                res.status(200).json({ error: false, msg: 'Publicacion Creada exitosamente!' })
            }
        });
    });

});

//get Publicaciones
router.get('/getPublicaciones', function (req, res) {
    var sql = "select id_publicacion,DATE_FORMAT(fecha,  '%d-%m-%Y %T') as fecha,imagen,contenido, Usuario\n";
    sql += "from PUBLICACION\n";
    sql += "inner join USUARIO\n";
    sql += "on USUARIO_id_usuario = id_usuario\n";
    sql += "order by 2 desc\n"
    connection.query(sql, [], (err, rows) => {
        if (err) throw err;

        Files = [];
        rows.map(publicacion => {

            let FilesSchema = {
                "id_publicacion": publicacion.id_publicacion,
                "fecha_publicacion": publicacion.fecha,
                "imagen_publicacion": publicacion.imagen,
                "contenido_publicacion": publicacion.contenido,
                "usuario_publicacion": publicacion.Usuario
            }

            Files.push(FilesSchema);
        })

        res.json(Files);
    });
});

//get Publicaciones
router.get('/getLabels', function (req, res) {
    var sql = "select id_etiqueta,nombre\n";
    sql += "from Etiqueta\n";
    sql += "order by 2 asc";

    connection.query(sql, [], (err, rows) => {
        if (err) throw err;

        Files = [];
        rows.map(etiqueta => {

            let FilesSchema = {
                "id_etiqueta": etiqueta.id_etiqueta,
                "nombre_etiqueta": etiqueta.nombre
            }

            Files.push(FilesSchema);
        })

        res.json(Files);
    });
});

//get publicaciones - labels
router.post('/getPubLabels', function (req, res) {
    var sql = "select p.id_publicacion,DATE_FORMAT(p.fecha,  '%d-%m-%Y %T') as fecha,p.imagen,p.contenido, Usuario\n";
    sql += "from PUBLICACION p\n";
    sql += "inner join Usuario\n";
    sql += "on USUARIO_id_usuario = id_usuario\n";
    sql += "inner join Publicacion_Etiqueta pe\n";
    sql += "on p.id_publicacion = pe.id_publicacion\n";
    sql += "where id_etiqueta = ?\n";
    sql += "order by 2 asc";

    connection.query(sql, [req.body.id_etiqueta], (err, rows) => {
        if (err) throw err;

        Files = [];
        rows.map(publicacion => {

            let FilesSchema = {
                "id_publicacion": publicacion.id_publicacion,
                "fecha_publicacion": publicacion.fecha,
                "imagen_publicacion": publicacion.imagen,
                "contenido_publicacion": publicacion.contenido,
                "usuario_publicacion": publicacion.Usuario
            }

            Files.push(FilesSchema);
        })

        res.json(Files);
    });
});

router.get('/translate', function (req, res) {
    // let text = body.text
    Files = [];
    var sql = "select id_publicacion,DATE_FORMAT(fecha,  '%d-%m-%Y %T') as fecha,imagen,contenido, Usuario\n";
    sql += "from PUBLICACION\n";
    sql += "inner join USUARIO\n";
    sql += "on USUARIO_id_usuario = id_usuario\n";
    sql += "order by 2 desc\n"
    connection.query(sql, [], (err, rows)  => {
        if (err) throw err;

        contador =0;
        rows.map(publicacion => {
            
            let params = {
                SourceLanguageCode: 'auto',
                TargetLanguageCode: 'es',
                Text: publicacion.contenido
            };
            translate.translateText(params, async function (err, data) {
                if (err) {
                    console.log(err, err.stack);
                    res.send({ error: err })
                } else {
                    
                    let FilesSchema = {
                        "id_publicacion": publicacion.id_publicacion,
                        "fecha_publicacion": publicacion.fecha,
                        "imagen_publicacion": publicacion.imagen,
                        "contenido_publicacion": data.TranslatedText,
                        "usuario_publicacion": publicacion.Usuario
                    }

                    Files.push(FilesSchema);
                    if(contador==rows.length-1){
                        res.json(Files);
                    }
                    contador++;
                }
            });
        
        });
       
        // res.json(Files);

    });
});

module.exports = router;